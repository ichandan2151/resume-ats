import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: Get scoring rubric for a job
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("scoring_rubrics")
    .select("*")
    .eq("job_id", jobId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || null });
}

// POST: Create or update scoring rubric for a job
// criteria format: [{ name: "Python experience", weight: 20, description: "5+ years required" }, ...]
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { jobId, criteria } = body as {
    jobId: string;
    criteria: { name: string; weight: number; description?: string }[];
  };

  if (!jobId || !criteria?.length) {
    return NextResponse.json({ error: "jobId and criteria are required" }, { status: 400 });
  }

  // Validate weights sum to 100
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight !== 100) {
    return NextResponse.json(
      { error: `Weights must sum to 100 (currently ${totalWeight})` },
      { status: 400 }
    );
  }

  const serviceSupabase = getServiceSupabase();

  const { data, error } = await serviceSupabase
    .from("scoring_rubrics")
    .upsert(
      {
        owner_id: auth.user.id,
        job_id: jobId,
        criteria,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
