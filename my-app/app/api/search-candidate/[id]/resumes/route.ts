import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const location = url.searchParams.get("candidate_location")?.trim();
  const minExp = parseInt(url.searchParams.get("years_experience") || "0", 10);
  const visa = url.searchParams.get("visa_status")?.trim();
  const workAuth = url.searchParams.get("work_authorization")?.trim();
  const status = url.searchParams.get("status")?.trim();

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const all = url.searchParams.get("all") === "true";
  if (all) {
    const { data: allResumes, error: allErr } = await supabase
      .from("resumes")
      .select("email, original_filename")
      .eq("job_id", id);

    if (allErr) {
      return NextResponse.json({ error: allErr.message }, { status: 500 });
    }
    return NextResponse.json({ data: allResumes });
  }

  // 1. Fetch matching resumes (all of them, to determine the top 10)
  let dataQuery = supabase
    .from("resumes")
    .select(
      "id, original_filename, full_name, email, phone, score, status, created_at, parsed_json"
    )
    .eq("job_id", id);

  if (location) {
    dataQuery = dataQuery.ilike("parsed_json->>candidate_location", `%${location}%`);
  }
  if (minExp > 0) {
    dataQuery = dataQuery.gte("parsed_json->>years_experience", minExp);
  }
  if (visa) {
    dataQuery = dataQuery.eq("parsed_json->>visa_status", visa);
  }
  if (workAuth) {
    dataQuery = dataQuery.eq("parsed_json->>work_authorization", workAuth);
  }
  if (status) {
    if (status === "failed") {
      dataQuery = dataQuery.in("status", ["failed", "error"]);
    } else {
      dataQuery = dataQuery.eq("status", status);
    }
  }

  const { data: allResumes, error } = await dataQuery;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const filtered = allResumes || [];

  // 3. Sort all remaining resumes by score descending, then created_at descending
  const sorted = filtered.sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : -1;
    const scoreB = typeof b.score === "number" ? b.score : -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // 4. Return all matching candidates
  const allCandidates = sorted;

  // Calculate stats based on all candidates
  const totalCount = allCandidates.length;
  const validScores = allCandidates
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number" && s !== null);
  const avgScore = validScores.length > 0
    ? validScores.reduce((sum, current) => sum + current, 0) / validScores.length
    : null;

  return NextResponse.json({
    data: allCandidates,
    totalCount,
    avgScore,
    page: 1,
    totalPages: 1,
  });
}
