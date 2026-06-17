import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseResumeWithGemini } from "@/lib/gemini";

export const runtime = "nodejs";

function cleanText(s: string) {
  return (s ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "");
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Fetch the resume row to verify ownership and get data
  const { data: resume, error: fetchErr } = await supabase
    .from("resumes")
    .select("id, status, extracted_text, job_id, storage_bucket, storage_path")
    .eq("id", id)
    .single();

  if (fetchErr || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.status !== "failed" && resume.status !== "error") {
    return NextResponse.json(
      { error: "Only failed resumes can be retried" },
      { status: 400 },
    );
  }

  if (!resume.extracted_text) {
    return NextResponse.json(
      { error: "No extracted text available for this resume. Please re-upload." },
      { status: 400 },
    );
  }

  // 2. Set status back to "uploaded" (processing) so the UI shows the spinner
  await supabase
    .from("resumes")
    .update({ status: "uploaded", parsed_json: null })
    .eq("id", id);

  // 3. Fire and forget the background re-processing
  retryInBackground(
    auth.user.id,
    resume.job_id,
    id,
    resume.extracted_text,
    resume.storage_bucket,
    resume.storage_path,
  ).catch(console.error);

  return NextResponse.json({ success: true, message: "Retry started" });
}

async function retryInBackground(
  userId: string,
  jobId: string,
  id: string,
  extractedText: string,
  bucket: string,
  path: string,
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
    return;
  }

  const supabaseAdmin = (await import("@supabase/supabase-js")).createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Fetch job context
    let jobContext = "Not provided";
    const { data: jobData } = await supabaseAdmin
      .from("jobs")
      .select("title, description")
      .eq("id", jobId)
      .single();

    if (jobData) {
      jobContext = `Title: ${jobData.title || "Unknown"}\nDescription: ${
        jobData.description || "Not provided"
      }`;
    }

    const cleaned = cleanText(extractedText);
    const geminiResult = await parseResumeWithGemini(cleaned, jobContext);

    if (!geminiResult.success) {
      await supabaseAdmin
        .from("resumes")
        .update({
          status: "error",
          parsed_json: {
            error: geminiResult.message,
            error_code: geminiResult.code,
            retryable: geminiResult.retryable,
          },
        })
        .eq("id", id);
      return;
    }

    const geminiData = geminiResult.data;
    const finalScore = geminiData.scoring?.score ?? 0;
    const finalBreakdown = geminiData.scoring?.breakdown ?? {
      relevance: "Scoring failed",
      strengths: [],
      weaknesses: [],
    };

    await supabaseAdmin
      .from("resumes")
      .update({
        full_name: geminiData.full_name,
        email: geminiData.email,
        phone: geminiData.phone,
        status: "scored",
        score: finalScore,
        score_breakdown: finalBreakdown,
        scoring_version: "gemini-1.0",
        parsed_json: geminiData,
      })
      .eq("id", id);
  } catch (err: any) {
    console.error("Retry background parsing failed:", err);
    await supabaseAdmin
      .from("resumes")
      .update({
        status: "error",
        parsed_json: {
          error: err?.message ?? String(err),
          error_code: "UNKNOWN",
          retryable: true,
        },
      })
      .eq("id", id);
  } finally {
    if (jobId) {
      try {
        const { checkAndSendSearchNotification } = await import("@/lib/mail");
        await checkAndSendSearchNotification(supabaseAdmin, userId, jobId);
      } catch (mailErr) {
        console.error("Failed to trigger search criteria completion email notification:", mailErr);
      }
    }
  }
}
