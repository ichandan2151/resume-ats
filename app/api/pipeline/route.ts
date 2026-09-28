import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const VALID_STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"];

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: Fetch all candidate stages for a job, grouped by stage
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

  // Fetch candidate stages for this job owned by this user
  const { data: stages, error: stagesErr } = await supabase
    .from("candidate_stages")
    .select("id, resume_id, job_id, stage, moved_at, moved_by, created_at")
    .eq("job_id", jobId)
    .eq("owner_id", auth.user.id);

  if (stagesErr) {
    return NextResponse.json({ error: stagesErr.message }, { status: 500 });
  }

  if (!stages || stages.length === 0) {
    // Return empty groups
    const grouped: Record<string, any[]> = {};
    for (const s of VALID_STAGES) {
      grouped[s] = [];
    }
    return NextResponse.json({ data: grouped });
  }

  // Fetch associated resumes to get candidate details
  const resumeIds = stages.map((s) => s.resume_id);
  const { data: resumes, error: resumesErr } = await supabase
    .from("resumes")
    .select("id, full_name, score, email, phone")
    .in("id", resumeIds);

  if (resumesErr) {
    return NextResponse.json({ error: resumesErr.message }, { status: 500 });
  }

  // Build a lookup map for resume data
  const resumeMap = new Map<string, any>();
  for (const r of resumes || []) {
    resumeMap.set(r.id, r);
  }

  // Group stages and attach resume info
  const grouped: Record<string, any[]> = {};
  for (const s of VALID_STAGES) {
    grouped[s] = [];
  }

  for (const stage of stages) {
    const resume = resumeMap.get(stage.resume_id);
    const entry = {
      id: stage.id,
      resumeId: stage.resume_id,
      jobId: stage.job_id,
      stage: stage.stage,
      movedAt: stage.moved_at,
      movedBy: stage.moved_by,
      createdAt: stage.created_at,
      candidateName: resume?.full_name || null,
      score: resume?.score ?? null,
      email: resume?.email || null,
      phone: resume?.phone || null,
    };

    if (grouped[stage.stage]) {
      grouped[stage.stage].push(entry);
    } else {
      // Handle any unexpected stage value
      grouped[stage.stage] = [entry];
    }
  }

  return NextResponse.json({ data: grouped });
}

// POST: Create or update a candidate's pipeline stage (upsert by resume_id + job_id)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { resumeId, jobId, stage } = await req.json();

    if (!resumeId || !jobId || !stage) {
      return NextResponse.json(
        { error: "resumeId, jobId, and stage are required" },
        { status: 400 }
      );
    }

    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    // Use service role client for upsert to bypass RLS
    const serviceSupabase = getServiceSupabase();

    const { data, error } = await serviceSupabase
      .from("candidate_stages")
      .upsert(
        {
          owner_id: auth.user.id,
          resume_id: resumeId,
          job_id: jobId,
          stage,
          moved_at: new Date().toISOString(),
          moved_by: auth.user.id,
        },
        { onConflict: "resume_id,job_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
