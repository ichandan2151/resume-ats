import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const location = url.searchParams.get("candidate_location")?.trim();
  const minExp = parseInt(url.searchParams.get("years_experience") || "0", 10);
  const visa = url.searchParams.get("visa_status")?.trim();
  const workAuth = url.searchParams.get("work_authorization")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 30;

  // Query all candidates belonging to the user
  let query = supabase
    .from("resumes")
    .select("id, original_filename, full_name, email, phone, score, status, created_at, parsed_json, job_id")
    .eq("owner_id", auth.user.id)
    .order("created_at", { ascending: false });

  // Apply filters at DB level where possible
  if (location) {
    query = query.ilike("parsed_json->>candidate_location", `%${location}%`);
  }
  if (minExp > 0) {
    query = query.gte("parsed_json->>years_experience", minExp);
  }
  if (visa) {
    query = query.eq("parsed_json->>visa_status", visa);
  }
  if (workAuth) {
    query = query.eq("parsed_json->>work_authorization", workAuth);
  }
  if (status) {
    if (status === "failed") {
      query = query.in("status", ["failed", "error"]);
    } else {
      query = query.eq("status", status);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate by email in memory
  const seenEmails = new Set<string>();
  const uniqueCandidates: typeof data = [];

  for (const resume of (data || [])) {
    const email = resume.email?.trim().toLowerCase();
    if (email) {
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        uniqueCandidates.push(resume);
      }
    } else {
      // If there is no email, treat each resume upload as a unique candidate entry
      uniqueCandidates.push(resume);
    }
  }

  // Calculate paginated metrics
  const totalCount = uniqueCandidates.length;
  const startIndex = (page - 1) * limit;
  const paginatedData = uniqueCandidates.slice(startIndex, startIndex + limit);

  return NextResponse.json({
    data: paginatedData,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit) || 1,
  });
}
