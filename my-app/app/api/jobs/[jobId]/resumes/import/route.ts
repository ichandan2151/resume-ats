import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseResumeWithGemini } from "@/lib/gemini";

export const runtime = "nodejs";

// Background processing for scoring the imported candidate against the job description
async function analyzeResumeBackground(
  userId: string,
  jobId: string,
  id: string,
  extractedText: string,
  fileName: string,
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
    // 1) Fetch job details for Gemini context
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

    // 2) Score resume with Gemini using the target job description
    const geminiResult = await parseResumeWithGemini(extractedText, jobContext);

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

    // Keep candidate data from original parse, but update scoring
    const { data: currentResume } = await supabaseAdmin
      .from("resumes")
      .select("parsed_json")
      .eq("id", id)
      .single();

    const currentParsed = currentResume?.parsed_json || {};
    const updatedParsed = {
      ...currentParsed,
      scoring: geminiData.scoring
    };

    const { error: updErr } = await supabaseAdmin
      .from("resumes")
      .update({
        status: "scored",
        score: finalScore,
        score_breakdown: finalBreakdown,
        scoring_version: "gemini-1.0",
        parsed_json: updatedParsed,
      })
      .eq("id", id);

    if (updErr) throw new Error(updErr.message);
  } catch (err: any) {
    console.error("Background analysis failed for resume", id, fileName, err);
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
        const { checkAndSendJobNotification } = await import("@/lib/mail");
        await checkAndSendJobNotification(supabaseAdmin, userId, jobId);
      } catch (mailErr) {
        console.error("Failed to trigger job completion email notification:", mailErr);
      }
    }
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { resumeIds } = await req.json();
    if (!resumeIds || !Array.isArray(resumeIds) || resumeIds.length === 0) {
      return NextResponse.json({ error: "Missing resumeIds" }, { status: 400 });
    }

    // Verify job exists and belongs to the user
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const importedIds: string[] = [];
    const skippedCount: number = 0;

    for (const resumeId of resumeIds) {
      // 1) Fetch source resume
      const { data: srcResume, error: srcErr } = await supabase
        .from("resumes")
        .select("*")
        .eq("id", resumeId)
        .eq("owner_id", auth.user.id)
        .single();

      if (srcErr || !srcResume) {
        continue; // Skip if resume doesn't exist or isn't owned by user
      }

      // 2) Check for duplicates already in this job
      let hasDuplicate = false;
      const email = srcResume.email?.trim().toLowerCase();
      if (email) {
        const { data: dup } = await supabase
          .from("resumes")
          .select("id")
          .eq("job_id", jobId)
          .eq("email", email)
          .limit(1);
        if (dup && dup.length > 0) hasDuplicate = true;
      } else {
        const { data: dup } = await supabase
          .from("resumes")
          .select("id")
          .eq("job_id", jobId)
          .eq("original_filename", srcResume.original_filename)
          .limit(1);
        if (dup && dup.length > 0) hasDuplicate = true;
      }

      if (hasDuplicate) {
        continue; // Prevent importing duplicate candidates to the same job
      }

      // 3) Create a new resume record linked to the target job
      const { data: newRow, error: insErr } = await supabase
        .from("resumes")
        .insert({
          owner_id: auth.user.id,
          job_id: jobId,
          source: "upload",
          original_filename: srcResume.original_filename,
          storage_bucket: srcResume.storage_bucket,
          storage_path: srcResume.storage_path,
          mime_type: srcResume.mime_type,
          file_size_bytes: srcResume.file_size_bytes,
          full_name: srcResume.full_name,
          email: srcResume.email,
          phone: srcResume.phone,
          location: srcResume.location,
          extracted_text: srcResume.extracted_text,
          parsed_json: srcResume.parsed_json,
          status: "uploaded", // valid processing state, triggers UI polling
        })
        .select("id")
        .single();

      if (insErr || !newRow) {
        continue;
      }

      importedIds.push(newRow.id);

      // 4) Score the cloned candidate in the background
      analyzeResumeBackground(
        auth.user.id,
        jobId,
        newRow.id,
        srcResume.extracted_text || "",
        srcResume.original_filename,
      ).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      importedCount: importedIds.length,
      importedIds,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Import failed" },
      { status: 500 },
    );
  }
}
