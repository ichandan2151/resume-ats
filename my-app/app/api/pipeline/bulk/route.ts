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

// POST: Move multiple candidates to a stage at once
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { resumeIds, jobId, stage } = await req.json();

    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      return NextResponse.json(
        { error: "resumeIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!jobId || !stage) {
      return NextResponse.json(
        { error: "jobId and stage are required" },
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

    const now = new Date().toISOString();
    const rows = resumeIds.map((resumeId: string) => ({
      owner_id: auth.user!.id,
      resume_id: resumeId,
      job_id: jobId,
      stage,
      moved_at: now,
      moved_by: auth.user!.id,
    }));

    const { data, error } = await serviceSupabase
      .from("candidate_stages")
      .upsert(rows, { onConflict: "resume_id,job_id" })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, count: data?.length ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
