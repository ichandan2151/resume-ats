import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const url = new URL(_req.url);
  const location = url.searchParams.get("candidate_location")?.trim();
  const minExp = parseInt(url.searchParams.get("years_experience") || "0", 10);
  const visa = url.searchParams.get("visa_status")?.trim();
  const workAuth = url.searchParams.get("work_authorization")?.trim();

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let dataQuery = supabase
    .from("resumes")
    .select(
      "id, original_filename, full_name, email, phone, score, status, created_at, parsed_json",
    )
    .eq("job_id", jobId);

  if (location) {
    // case-insensitive fuzzy match on JSON field
    dataQuery = dataQuery.ilike(
      "parsed_json->>candidate_location",
      `%${location}%`,
    );
  }
  if (minExp > 0) {
    // Cast JSON field to integer for comparison
    dataQuery = dataQuery.gte("parsed_json->>years_experience", minExp);
  }
  if (visa) {
    dataQuery = dataQuery.eq("parsed_json->>visa_status", visa);
  }
  if (workAuth) {
    dataQuery = dataQuery.eq("parsed_json->>work_authorization", workAuth);
  }

  const { data, error } = await dataQuery;

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
