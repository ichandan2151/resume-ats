import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { analyzeResumeBackground } from "@/app/api/search-candidate/[id]/resumes/import/route";

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
    .select("job_id, score");

  if (resErr)
    return NextResponse.json({ error: resErr.message }, { status: 500 });

  const statsByJob = new Map<
    string,
    { count: number; sum: number; max: number }
  >();
  for (const r of resumes ?? []) {
    const jobId = r.job_id as string | null;
    if (!jobId) continue;
    const s = typeof r.score === "number" ? r.score : null;

    const cur = statsByJob.get(jobId) ?? { count: 0, sum: 0, max: -Infinity };
    cur.count += 1;
    if (s != null) {
      cur.sum += s;
      cur.max = Math.max(cur.max, s);
    }
    statsByJob.set(jobId, cur);
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

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      owner_id: auth.user.id,
      title,
      company: String(body?.company ?? "").trim() || null,
      location: String(body?.location ?? "").trim() || null,
      description,
    })
    .select("id")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const jobId = data.id;

  // Fetch all candidate resumes belonging to the user that are in the Candidate Directory
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

    // Import each unique candidate to the newly created search campaign
    let index = 0;
    for (const srcResume of uniqueCandidates) {
      const { data: newRow, error: insErr } = await supabase
        .from("resumes")
        .insert({
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
        })
        .select("id")
        .single();

      if (insErr || !newRow) {
        continue;
      }

      // Fire and forget scoring in the background with a 10s staggering delay
      const delayMs = index * 10000;
      setTimeout(() => {
        analyzeResumeBackground(
          auth.user.id,
          jobId,
          newRow.id,
          srcResume.extracted_text || "",
          srcResume.original_filename,
        ).catch((err) => {
          console.error("Failed to analyze resume background in search creation flow:", err);
        });
      }, delayMs);

      index++;
    }
  }

  return NextResponse.json({ data });
}
