import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET: AI governance & monitoring dashboard data
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all AI logs for the period
  const { data: logs, error } = await supabase
    .from("ai_logs")
    .select("*")
    .eq("owner_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allLogs = logs || [];

  // Overview metrics
  const totalCalls = allLogs.length;
  const successfulCalls = allLogs.filter((l) => l.success).length;
  const failedCalls = totalCalls - successfulCalls;
  const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;

  // Latency stats
  const latencies = allLogs.filter((l) => l.latency_ms).map((l) => l.latency_ms);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length)
    : 0;
  const p95Latency = latencies.length > 0
    ? latencies.sort((a: number, b: number) => a - b)[Math.floor(latencies.length * 0.95)] || 0
    : 0;

  // Cost tracking
  const totalCost = allLogs.reduce((sum, l) => sum + (Number(l.cost_usd) || 0), 0);

  // Token usage
  const totalInputTokens = allLogs.reduce((sum, l) => sum + (l.tokens_input || 0), 0);
  const totalOutputTokens = allLogs.reduce((sum, l) => sum + (l.tokens_output || 0), 0);

  // By provider
  const byProvider: Record<string, { calls: number; success: number; avgLatency: number }> = {};
  allLogs.forEach((l) => {
    if (!byProvider[l.provider]) {
      byProvider[l.provider] = { calls: 0, success: 0, avgLatency: 0 };
    }
    byProvider[l.provider].calls++;
    if (l.success) byProvider[l.provider].success++;
  });
  Object.keys(byProvider).forEach((p) => {
    const providerLogs = allLogs.filter((l) => l.provider === p && l.latency_ms);
    byProvider[p].avgLatency = providerLogs.length > 0
      ? Math.round(providerLogs.reduce((sum, l) => sum + l.latency_ms, 0) / providerLogs.length)
      : 0;
  });

  // By feature
  const byFeature: Record<string, { calls: number; success: number; avgLatency: number }> = {};
  allLogs.forEach((l) => {
    if (!byFeature[l.feature]) {
      byFeature[l.feature] = { calls: 0, success: 0, avgLatency: 0 };
    }
    byFeature[l.feature].calls++;
    if (l.success) byFeature[l.feature].success++;
  });
  Object.keys(byFeature).forEach((f) => {
    const featureLogs = allLogs.filter((l) => l.feature === f && l.latency_ms);
    byFeature[f].avgLatency = featureLogs.length > 0
      ? Math.round(featureLogs.reduce((sum, l) => sum + l.latency_ms, 0) / featureLogs.length)
      : 0;
  });

  // By model
  const byModel: Record<string, number> = {};
  allLogs.forEach((l) => {
    byModel[l.model] = (byModel[l.model] || 0) + 1;
  });

  // Daily trend (calls per day)
  const dailyTrend: Record<string, { calls: number; success: number; errors: number }> = {};
  allLogs.forEach((l) => {
    const day = l.created_at.split("T")[0];
    if (!dailyTrend[day]) dailyTrend[day] = { calls: 0, success: 0, errors: 0 };
    dailyTrend[day].calls++;
    if (l.success) dailyTrend[day].success++;
    else dailyTrend[day].errors++;
  });

  // Recent errors
  const recentErrors = allLogs
    .filter((l) => !l.success && l.error)
    .slice(0, 10)
    .map((l) => ({
      feature: l.feature,
      provider: l.provider,
      model: l.model,
      error: l.error,
      timestamp: l.created_at,
    }));

  return NextResponse.json({
    data: {
      overview: {
        totalCalls,
        successfulCalls,
        failedCalls,
        successRate,
        avgLatency,
        p95Latency,
        totalCost: Math.round(totalCost * 10000) / 10000,
        totalInputTokens,
        totalOutputTokens,
      },
      byProvider,
      byFeature,
      byModel,
      dailyTrend,
      recentErrors,
      periodDays: days,
    },
  });
}
