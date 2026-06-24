import { NextResponse, after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseResumeWithOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

// Background processing for scoring the imported candidate against the search campaign description
export async function analyzeResumeBackground(
  userId: string,
  searchId: string,
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
    // 1) Fetch search details for Gemini context (using jobs table)
    let searchContext = "Not provided";
    const { data: searchData } = await supabaseAdmin
      .from("jobs")
      .select("title, description")
      .eq("id", searchId)
      .single();

    if (searchData) {
      searchContext = `Title: ${searchData.title || "Unknown"}\nDescription: ${
        searchData.description || "Not provided"
      }`;
    }

    // 2) Score resume with OpenAI using the target search campaign description
    const openaiResult = await parseResumeWithOpenAI(extractedText, searchContext);

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

    // Keep candidate data from original parse, but update scoring
    const { data: currentResume } = await supabaseAdmin
      .from("resumes")
      .select("parsed_json")
      .eq("id", id)
      .single();

    const currentParsed = currentResume?.parsed_json || {};
    const updatedParsed = {
      ...currentParsed,
      scoring: openaiData.scoring
    };

    const { error: updErr } = await supabaseAdmin
      .from("resumes")
      .update({
        status: "scored",
        score: finalScore,
        score_breakdown: finalBreakdown,
        scoring_version: "openai-1.0",
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
    if (searchId) {
      try {
        const { checkAndSendSearchNotification } = await import("@/lib/mail");
        await checkAndSendSearchNotification(supabaseAdmin, userId, searchId);
      } catch (mailErr) {
        console.error("Failed to trigger search criteria completion email notification:", mailErr);
      }
    }
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: searchId } = await params;
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

    // Verify search exists and belongs to the user
    const { data: search, error: searchErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", searchId)
      .single();

    if (searchErr || !search) {
      return NextResponse.json({ error: "Search criteria not found" }, { status: 404 });
    }

    const importedIds: string[] = [];

    for (const resumeId of resumeIds) {
      // 1) Fetch source resume
      const { data: srcResume, error: srcErr } = await supabase
        .from("resumes")
        .select("*")
        .eq("id", resumeId)
        .eq("owner_id", auth.user.id)
        .single();

      if (srcErr || !srcResume) {
        continue;
      }

      // Enforce that only fully processed/parsed resumes can be imported
      if (srcResume.status === "uploaded" || srcResume.status === "processing" || !srcResume.extracted_text) {
        continue;
      }

      // 2) Check for duplicates already in this search campaign
      let hasDuplicate = false;
      const email = srcResume.email?.trim().toLowerCase();
      if (email) {
        const { data: dup } = await supabase
          .from("resumes")
          .select("id")
          .eq("job_id", searchId)
          .eq("email", email)
          .limit(1);
        if (dup && dup.length > 0) hasDuplicate = true;
      } else {
        const { data: dup } = await supabase
          .from("resumes")
          .select("id")
          .eq("job_id", searchId)
          .eq("original_filename", srcResume.original_filename)
          .limit(1);
        if (dup && dup.length > 0) hasDuplicate = true;
      }

      if (hasDuplicate) {
        continue;
      }

      // 3) Create a new resume record linked to the target search campaign (mapped to job_id column)
      const { data: newRow, error: insErr } = await supabase
        .from("resumes")
        .insert({
          owner_id: auth.user.id,
          job_id: searchId,
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
          status: "uploaded",
        })
        .select("id")
        .single();

      if (insErr || !newRow) {
        continue;
      }

      importedIds.push(newRow.id);

      // 4) Score the cloned candidate in the background using after() for Vercel
      after(() => {
        analyzeResumeBackground(
          auth.user.id,
          searchId,
          newRow.id,
          srcResume.extracted_text || "",
          srcResume.original_filename,
        ).catch(console.error);
      });
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
