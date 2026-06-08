import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count jobs owned by this user
  const { count: jobCount, error: jobErr } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", auth.user.id);

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  // Count total resumes uploaded for jobs owned by this user
  const { data: userJobs, error: userJobsErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("owner_id", auth.user.id);

  if (userJobsErr) {
    return NextResponse.json({ error: userJobsErr.message }, { status: 500 });
  }

  const jobIds = (userJobs ?? []).map((j) => j.id);

  let resumeCount = 0;
  if (jobIds.length > 0) {
    const { count: resCount, error: resErr } = await supabase
      .from("resumes")
      .select("*", { count: "exact", head: true })
      .in("job_id", jobIds);

    if (resErr) {
      return NextResponse.json({ error: resErr.message }, { status: 500 });
    }
    resumeCount = resCount ?? 0;
  }

  return NextResponse.json({
    email: auth.user.email,
    jobCount: jobCount ?? 0,
    resumeCount,
    plan: "Free Tier",
    usageLimit: 50,
  });
}
