import { NextResponse, after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseResumeWithOpenAI } from "@/lib/openai";

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
    .select("id, status, extracted_text, job_id, storage_bucket, storage_path, original_filename, owner_id")
    .eq("id", id)
    .single();

  if (fetchErr || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.status === "uploaded" || resume.status === "processing") {
    return NextResponse.json(
      { error: "Resume is currently processing and cannot be retried yet" },
      { status: 400 },
    );
  }

  let finalStoragePath = resume.storage_path || "";
  let finalStorageBucket = resume.storage_bucket || "resumes";

  if (!finalStoragePath && resume.original_filename) {
    const safeName = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(0, 120);
    finalStoragePath = resume.job_id
      ? `${resume.owner_id}/${resume.job_id}/${id}/${safeName(resume.original_filename)}`
      : `${resume.owner_id}/candidates/${id}/${safeName(resume.original_filename)}`;
  }

  if (!resume.extracted_text && !finalStoragePath) {
    return NextResponse.json(
      { error: "No text or storage path available for this resume. Please re-upload." },
      { status: 400 },
    );
  }

  // 2. Set status back to "uploaded" (processing) so the UI shows the spinner, and clear old score
  await supabase
    .from("resumes")
    .update({ 
      status: "uploaded", 
      parsed_json: null,
      score: null,
      score_breakdown: {}
    })
    .eq("id", id);

  // 3. Fire and forget the background re-processing using after() to support serverless runtime
  after(() => {
    retryInBackground(
      auth.user.id,
      resume.job_id,
      id,
      resume.extracted_text,
      finalStorageBucket,
      finalStoragePath,
    ).catch(console.error);
  });

  return NextResponse.json({ success: true, message: "Retry started" });
}

export async function retryInBackground(
  userId: string,
  jobId: string | null,
  id: string,
  extractedText: string | null,
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
    let textToUse = extractedText;

    if (!textToUse && bucket && path) {
      console.log(`Downloading file from storage: bucket=${bucket}, path=${path}`);
      const { data: fileData, error: downloadErr } = await supabaseAdmin.storage
        .from(bucket)
        .download(path);

      if (downloadErr || !fileData) {
        throw new Error(`Failed to download resume file from storage: ${downloadErr?.message ?? "Empty file data"}`);
      }

      // We need original_filename and mime_type to extract text
      const { data: resumeRow, error: rowErr } = await supabaseAdmin
        .from("resumes")
        .select("original_filename, mime_type")
        .eq("id", id)
        .single();

      if (rowErr || !resumeRow) {
        throw new Error(`Failed to fetch original_filename/mime_type: ${rowErr?.message ?? "Row not found"}`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const { extractText } = await import("@/lib/extract");
      const rawText = await extractText(
        resumeRow.original_filename,
        resumeRow.mime_type || undefined,
        buffer,
      );
      
      textToUse = cleanText(rawText);

      // Save extracted text and persist the reconstructed storage bucket/path to database
      await supabaseAdmin
        .from("resumes")
        .update({ 
          extracted_text: textToUse,
          storage_bucket: bucket,
          storage_path: path
        })
        .eq("id", id);
    }

    // Fetch job context
    let jobContext = "Not provided";
    if (jobId) {
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
    }

    const cleaned = cleanText(textToUse ?? "");
    const openaiResult = await parseResumeWithOpenAI(cleaned, jobContext);

    if (!openaiResult.success) {
      await supabaseAdmin
        .from("resumes")
        .update({
          status: "error",
          parsed_json: {
            error: openaiResult.message,
            error_code: openaiResult.code,
            retryable: openaiResult.retryable,
          },
        })
        .eq("id", id);
      return;
    }

    const openaiData = openaiResult.data;
    const finalScore = openaiData.scoring?.score ?? 0;
    const finalBreakdown = openaiData.scoring?.breakdown ?? {
      relevance: "Scoring failed",
      strengths: [],
      weaknesses: [],
    };

    await supabaseAdmin
      .from("resumes")
      .update({
        full_name: openaiData.full_name,
        email: openaiData.email,
        phone: openaiData.phone,
        status: "scored",
        score: jobId ? finalScore : null,
        score_breakdown: jobId ? finalBreakdown : {},
        scoring_version: "openai-1.0",
        parsed_json: openaiData,
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
