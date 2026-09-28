import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { copilotQuery } from "@/lib/claude";
import { parseCampaignDescription } from "@/lib/campaign";
import { logAICall } from "@/lib/ai-logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { query, jobId } = body as { query: string; jobId?: string };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Fetch candidates for context
  let candidateQuery = supabase
    .from("resumes")
    .select("id, full_name, email, phone, score, status, parsed_json, score_breakdown")
    .eq("owner_id", auth.user.id)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);

  if (jobId) {
    candidateQuery = candidateQuery.eq("job_id", jobId);
  }

  const { data: resumes } = await candidateQuery;

  const candidates = (resumes || []).map((r) => {
    const p = r.parsed_json || {};
    return {
      id: r.id,
      name: r.full_name || p.full_name || "Unknown",
      email: r.email || p.email,
      score: r.score,
      status: r.status,
      skills: p.skills || [],
      yearsExperience: p.years_experience || 0,
      location: p.candidate_location || null,
      summary: p.summary || null,
      experience: (p.experience || []).slice(0, 3).map((e: any) => ({
        role: e.role,
        company: e.company,
        duration: e.duration,
      })),
      education: (p.education || []).slice(0, 2),
      strengths: r.score_breakdown?.strengths || p.scoring?.breakdown?.strengths || [],
      weaknesses: r.score_breakdown?.weaknesses || p.scoring?.breakdown?.weaknesses || [],
    };
  });

  // Fetch job context if provided
  let jobTitle: string | undefined;
  let jobDescription: string | undefined;
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, description")
      .eq("id", jobId)
      .single();
    if (job) {
      jobTitle = job.title;
      const { descriptionText } = parseCampaignDescription(job.description);
      jobDescription = descriptionText;
    }
  }

  const startTime = Date.now();
  const result = await copilotQuery(query, { candidates, jobTitle, jobDescription });
  const duration = Date.now() - startTime;

  // Log the AI call
  await logAICall(supabase, {
    owner_id: auth.user.id,
    provider: "claude",
    model: "claude-sonnet-4-20250514",
    feature: "copilot",
    input_summary: query.slice(0, 200),
    success: result.success,
    latency_ms: duration,
    error: result.success ? undefined : result.error,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ response: result.data });
}
