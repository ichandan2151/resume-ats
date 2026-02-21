import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch jobs
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title, company, location, description, created_at")
    .order("created_at", { ascending: false });

  if (jobsErr)
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  // Fetch resumes for current user to compute stats (simple + reliable for now)
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
  const description = String(body?.description ?? "").trim(); // required now

  if (!title) {
    return NextResponse.json(
      { error: "Job title is required" },
      { status: 400 },
    );
  }

  if (!description) {
    return NextResponse.json(
      { error: "Job description is required" },
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
      description, // never null
    })
    .select("id")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
