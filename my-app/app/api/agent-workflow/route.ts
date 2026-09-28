import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { runAgentWorkflow } from "@/lib/agent-workflow";
import { parseCampaignDescription } from "@/lib/campaign";
import { logAICall } from "@/lib/ai-logger";

export const runtime = "nodejs";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST: Run the agentic workflow on one or more resumes
// Body: { resumeIds: string[], jobId: string }
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { resumeIds, jobId } = body as { resumeIds: string[]; jobId: string };

  if (!resumeIds?.length || !jobId) {
    return NextResponse.json(
      { error: "resumeIds and jobId are required" },
      { status: 400 }
    );
  }

  if (resumeIds.length > 10) {
    return NextResponse.json(
      { error: "Maximum 10 resumes per workflow run" },
      { status: 400 }
    );
  }

  // Fetch job info
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, title, description")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { descriptionText } = parseCampaignDescription(job.description);
  const serviceSupabase = getServiceSupabase();

  const results: Record<string, any> = {};

  const workflowStart = Date.now();

  for (const resumeId of resumeIds) {
    try {
      const result = await runAgentWorkflow(
        supabase,
        serviceSupabase,
        auth.user.id,
        resumeId,
        jobId,
        descriptionText,
        job.title
      );
      results[resumeId] = {
        success: true,
        steps: result.steps,
        summary: result.summary,
        durationMs: result.totalDurationMs,
      };
    } catch (e: any) {
      results[resumeId] = {
        success: false,
        error: e.message,
      };
    }
  }

  const totalDuration = Date.now() - workflowStart;

  await logAICall(supabase, {
    owner_id: auth.user.id,
    provider: "openai",
    model: "gpt-4o-mini",
    feature: "agent-workflow",
    input_summary: `Workflow for ${resumeIds.length} resumes in job ${job.title}`,
    success: true,
    latency_ms: totalDuration,
  });

  return NextResponse.json({
    data: {
      results,
      totalDurationMs: totalDuration,
      processedCount: resumeIds.length,
    },
  });
}
