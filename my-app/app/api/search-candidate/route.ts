import { NextResponse, after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractKeywordsFromJobDescription, calculateMatchScore } from "@/lib/openai";
import { parseCampaignDescription, encodeCampaignDescription } from "@/lib/campaign";
import { retryInBackground } from "@/app/api/resumes/[id]/retry/route";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch searches (from jobs table)
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title, company, location, description, created_at")
    .order("created_at", { ascending: false });

  if (jobsErr)
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  // Fetch resumes for current user to compute stats
  const { data: resumes, error: resErr } = await supabase
    .from("resumes")
    .select("job_id, score, created_at, status")
    .eq("owner_id", auth.user.id);

  if (resErr)
    return NextResponse.json({ error: resErr.message }, { status: 500 });

  const resumesByJob = new Map<string, any[]>();
  for (const r of resumes ?? []) {
    const jobId = r.job_id as string | null;
    if (!jobId) continue;
    if (!resumesByJob.has(jobId)) {
      resumesByJob.set(jobId, []);
    }
    resumesByJob.get(jobId)!.push(r);
  }

  const statsByJob = new Map<
    string,
    { count: number; sum: number; max: number }
  >();

  for (const [jobId, list] of resumesByJob.entries()) {
    // Sort descending by score, then created_at
    const sorted = list.sort((a, b) => {
      const scoreA = typeof a.score === "number" ? a.score : -1;
      const scoreB = typeof b.score === "number" ? b.score : -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Calculate dashboard stats using all matching candidates
    const allCandidates = sorted;
    const count = allCandidates.length;
    let sum = 0;
    let max = -Infinity;
    for (const r of allCandidates) {
      const s = typeof r.score === "number" ? r.score : null;
      if (s != null) {
        sum += s;
        max = Math.max(max, s);
      }
    }
    statsByJob.set(jobId, { count, sum, max });
  }

  const enriched = (jobs ?? []).map((j) => {
    const st = statsByJob.get(j.id) ?? { count: 0, sum: 0, max: -Infinity };
    const avg = st.count > 0 ? st.sum / st.count : null;
    const top = st.max === -Infinity ? null : st.max;

    return {
      ...j,
      candidate_count: st.count,
      avg_score: avg,
      top_score: top,
    };
  });

  return NextResponse.json({ data: enriched });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const aiScreening = body?.aiScreening === true; // defaults to false if not sent, or can default to true

  if (!title) {
    return NextResponse.json(
      { error: "Search title is required" },
      { status: 400 },
    );
  }

  if (!description) {
    return NextResponse.json(
      { error: "Search criteria requirements description is required" },
      { status: 400 },
    );
  }

  // 1) Extract job keywords and enrich job description
  const jobKeywords = await extractKeywordsFromJobDescription(`Title: ${title}\nDescription: ${description}`);
  const descriptionWithKeywords = encodeCampaignDescription(description, jobKeywords, aiScreening);

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      owner_id: auth.user.id,
      title,
      company: String(body?.company ?? "").trim() || null,
      location: String(body?.location ?? "").trim() || null,
      description: descriptionWithKeywords,
    })
    .select("id")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const jobId = data.id;

  // 2) Fetch all candidate resumes in the Candidate Directory
  const { data: candidates, error: candErr } = await supabase
    .from("resumes")
    .select("*")
    .eq("owner_id", auth.user.id)
    .is("job_id", null);

  if (!candErr && candidates && candidates.length > 0) {
    // Sort descending by created_at to prioritize latest uploaded candidates during deduplication
    const sortedCandidates = [...candidates].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const seenEmails = new Set<string>();
    const seenStoragePaths = new Set<string>();
    const seenFilenames = new Set<string>();
    const uniqueCandidates: typeof sortedCandidates = [];

    for (const resume of sortedCandidates) {
      const email = resume.email?.trim().toLowerCase();
      const storagePath = resume.storage_path;
      const filename = resume.original_filename;

      if (email) {
        if (!seenEmails.has(email)) {
          seenEmails.add(email);
          if (storagePath) seenStoragePaths.add(storagePath);
          uniqueCandidates.push(resume);
        }
      } else if (storagePath) {
        if (!seenStoragePaths.has(storagePath)) {
          seenStoragePaths.add(storagePath);
          uniqueCandidates.push(resume);
        }
      } else if (filename) {
        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          uniqueCandidates.push(resume);
        }
      } else {
        uniqueCandidates.push(resume);
      }
    }

    // 3) Perform programmatic keyword matching or prepare AI scoring background tasks
    const rowsToInsert = uniqueCandidates.map((srcResume) => {
      if (aiScreening) {
        return {
          owner_id: auth.user.id,
          job_id: jobId,
          source: srcResume.source || "upload",
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
        };
      }

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

      return {
        owner_id: auth.user.id,
        job_id: jobId,
        source: srcResume.source || "upload",
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
      };
    });

    if (rowsToInsert.length > 0) {
      const { data: insertedRows, error: insErr } = await supabase
        .from("resumes")
        .insert(rowsToInsert)
        .select("id, extracted_text, storage_bucket, storage_path");

      if (insErr) {
        console.error("Failed to bulk insert matched candidates:", insErr.message);
      } else if (aiScreening && insertedRows) {
        // Trigger background screening using after()
        after(() => {
          for (const row of insertedRows) {
            retryInBackground(
              auth.user.id,
              jobId,
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

  return NextResponse.json({ data });
}
