import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET: Analytics dashboard data
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  const userId = auth.user.id;

  // 1. Campaign stats
  const { count: totalCampaigns } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId);

  // 2. Total candidates
  const { count: totalCandidates } = await supabase
    .from("resumes")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId);

  // 3. Candidates by status
  const { data: statusData } = await supabase
    .from("resumes")
    .select("status")
    .eq("owner_id", userId);

  const statusBreakdown: Record<string, number> = {};
  (statusData || []).forEach((r) => {
    statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1;
  });

  // 4. Average score
  const { data: scoreData } = await supabase
    .from("resumes")
    .select("score")
    .eq("owner_id", userId)
    .not("score", "is", null);

  const scores = (scoreData || []).map((r) => r.score).filter((s): s is number => s != null);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const scoreDistribution = {
    excellent: scores.filter((s) => s >= 80).length,
    good: scores.filter((s) => s >= 60 && s < 80).length,
    fair: scores.filter((s) => s >= 40 && s < 60).length,
    poor: scores.filter((s) => s < 40).length,
  };

  // 5. Voice call stats
  const { data: callData } = await supabase
    .from("voice_calls")
    .select("status, cost, call_duration_seconds, created_at")
    .eq("owner_id", userId);

  const calls = callData || [];
  const totalCalls = calls.length;
  const completedCalls = calls.filter((c) => c.status === "ended").length;
  const failedCalls = calls.filter((c) => c.status === "failed").length;
  const totalCallCost = calls.reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
  const totalCallDuration = calls.reduce((sum, c) => sum + (c.call_duration_seconds || 0), 0);
  const avgCallDuration = completedCalls > 0 ? Math.round(totalCallDuration / completedCalls) : 0;
  const callSuccessRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

  // 6. Pipeline stats (if candidate_stages table exists)
  let pipelineData: Record<string, number> = {};
  try {
    let pipelineQuery = supabase
      .from("candidate_stages")
      .select("stage")
      .eq("owner_id", userId);

    if (jobId) {
      pipelineQuery = pipelineQuery.eq("job_id", jobId);
    }

    const { data: stages } = await pipelineQuery;
    (stages || []).forEach((s) => {
      pipelineData[s.stage] = (pipelineData[s.stage] || 0) + 1;
    });
  } catch {
    // Table might not exist yet
  }

  // 7. Per-campaign stats (if jobId provided)
  let campaignStats = null;
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, created_at")
      .eq("id", jobId)
      .single();

    const { count: campaignCandidates } = await supabase
      .from("resumes")
      .select("*", { count: "exact", head: true })
      .eq("job_id", jobId);

    const { data: campaignScores } = await supabase
      .from("resumes")
      .select("score")
      .eq("job_id", jobId)
      .not("score", "is", null);

    const cScores = (campaignScores || []).map((r) => r.score).filter((s): s is number => s != null);
    const cAvg = cScores.length > 0 ? Math.round(cScores.reduce((a, b) => a + b, 0) / cScores.length) : 0;

    const { data: campaignCalls } = await supabase
      .from("voice_calls")
      .select("status, cost, call_duration_seconds")
      .eq("job_id", jobId);

    const cCalls = campaignCalls || [];

    campaignStats = {
      title: job?.title || "Unknown",
      createdAt: job?.created_at,
      totalCandidates: campaignCandidates || 0,
      avgScore: cAvg,
      totalCalls: cCalls.length,
      completedCalls: cCalls.filter((c) => c.status === "ended").length,
      callCost: cCalls.reduce((sum, c) => sum + (Number(c.cost) || 0), 0),
      daysOpen: job?.created_at
        ? Math.ceil((Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    };
  }

  // 8. Email stats
  let emailStats = { sent: 0 };
  try {
    const { count: emailsSent } = await supabase
      .from("email_logs")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", userId);
    emailStats.sent = emailsSent || 0;
  } catch {}

  return NextResponse.json({
    data: {
      overview: {
        totalCampaigns: totalCampaigns || 0,
        totalCandidates: totalCandidates || 0,
        avgScore,
        statusBreakdown,
        scoreDistribution,
      },
      calls: {
        totalCalls,
        completedCalls,
        failedCalls,
        callSuccessRate,
        totalCallCost: Math.round(totalCallCost * 1000) / 1000,
        totalCallDuration,
        avgCallDuration,
      },
      pipeline: pipelineData,
      emails: emailStats,
      campaign: campaignStats,
    },
  });
}
