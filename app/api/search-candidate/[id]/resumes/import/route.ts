import { NextResponse, after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractKeywordsFromJobDescription, calculateMatchScore } from "@/lib/openai";
import { parseCampaignDescription, encodeCampaignDescription } from "@/lib/campaign";
import { retryInBackground } from "@/app/api/resumes/[id]/retry/route";

export const runtime = "nodejs";

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

    // 1. Fetch the target job campaign details
    const { data: search, error: searchErr } = await supabase
      .from("jobs")
      .select("id, title, description")
      .eq("id", searchId)
      .single();

    if (searchErr || !search) {
      return NextResponse.json({ error: "Search criteria not found" }, { status: 404 });
    }

    // 2. Parse job description keywords and check if AI screening is enabled
    let jobKeywords: string[] = [];
    let aiScreening = false;
    let jobDescOnly = "";
    if (search.description) {
      const parsed = parseCampaignDescription(search.description);
      jobKeywords = parsed.keywords;
      aiScreening = parsed.aiScreening;
      jobDescOnly = parsed.descriptionText;

      if (jobKeywords.length === 0) {
        // Dynamic keyword extraction if missing (self-heal)
        jobKeywords = await extractKeywordsFromJobDescription(`Title: ${search.title || ""}\nDescription: ${jobDescOnly || search.description}`);
        const enrichedDesc = encodeCampaignDescription(jobDescOnly || search.description, jobKeywords, aiScreening);
        await supabase
          .from("jobs")
          .update({ description: enrichedDesc })
          .eq("id", searchId);
      }
    }

    const importedIds: string[] = [];
    const rowsToInsert: any[] = [];

    // 3. Process each candidate
    for (const resumeId of resumeIds) {
      // Fetch source resume
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

      // Check for duplicates already in this search campaign
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

      // 4. Compute matching score or prepare AI scoring background tasks
      if (aiScreening) {
        rowsToInsert.push({
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
          score: null,
          score_breakdown: {},
          scoring_version: "ai-1.0",
        });
      } else {
        const candidateKeywords = [
          ...(srcResume.parsed_json?.keywords || srcResume.parsed_json?.skills || [])
        ].map((k: any) => String(k).toLowerCase().trim());

        const { score, matched, missing } = calculateMatchScore(
          jobKeywords,
          candidateKeywords,
          srcResume.parsed_json?.years_experience
        );

        const score_breakdown = {
          relevance: `Matched ${matched.length} out of ${jobKeywords.length} job keywords.`,
          strengths: matched,
          weaknesses: missing,
        };

        const updatedParsed = {
          ...(srcResume.parsed_json || {}),
          scoring: {
            score,
            breakdown: score_breakdown,
          },
        };

        rowsToInsert.push({
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
          parsed_json: updatedParsed,
          status: "scored",
          score,
          score_breakdown,
          scoring_version: "keyword-1.0",
        });
      }
    }

    // 5. Bulk insert the matched candidate rows
    if (rowsToInsert.length > 0) {
      const { data: insertedRows, error: insErr } = await supabase
        .from("resumes")
        .insert(rowsToInsert)
        .select("id, extracted_text, storage_bucket, storage_path");

      if (insErr) {
        throw new Error("Bulk insert failed: " + insErr.message);
      }

      if (insertedRows) {
        insertedRows.forEach((row) => importedIds.push(row.id));

        if (aiScreening) {
          // Trigger background screening using after()
          after(() => {
            for (const row of insertedRows) {
              retryInBackground(
                auth.user.id,
                searchId,
                row.id,
                row.extracted_text,
                row.storage_bucket || "resumes",
                row.storage_path || ""
              ).catch(console.error);
            }
          });
        }
      }
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
