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
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 30;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Fetch matching stats (counts and scores) to calculate totals/average on server side
  let statsQuery = supabase
    .from("resumes")
    .select("score")
    .eq("job_id", id);

  if (location) {
    statsQuery = statsQuery.ilike("parsed_json->>candidate_location", `%${location}%`);
  }
  if (minExp > 0) {
    statsQuery = statsQuery.gte("parsed_json->>years_experience", minExp);
  }
  if (visa) {
    statsQuery = statsQuery.eq("parsed_json->>visa_status", visa);
  }
  if (workAuth) {
    statsQuery = statsQuery.eq("parsed_json->>work_authorization", workAuth);
  }
  if (status) {
    if (status === "failed") {
      statsQuery = statsQuery.in("status", ["failed", "error"]);
    } else {
      statsQuery = statsQuery.eq("status", status);
    }
  }

  const { data: statsData, error: statsError } = await statsQuery;
  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 500 });
  }

  const totalCount = statsData.length;
  const validScores = statsData
    .map((r) => r.score)
    .filter((s): s is number => typeof s === "number" && s !== null);
  const avgScore = validScores.length > 0
    ? validScores.reduce((sum, current) => sum + current, 0) / validScores.length
    : null;

  // 2. Fetch paginated resumes
  let dataQuery = supabase
    .from("resumes")
    .select(
      "id, original_filename, full_name, email, phone, score, status, created_at, parsed_json"
    )
    .eq("job_id", id)
    .order("created_at", { ascending: false })
    .range(from, to);

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

  const { data, error } = await dataQuery;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    totalCount,
    avgScore,
    page,
    totalPages: Math.ceil(totalCount / limit) || 1,
  });
}
