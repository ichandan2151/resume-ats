import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { compareWithClaude } from "@/lib/claude";
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
  const { resumeIds, jobId } = body as { resumeIds: string[]; jobId?: string };

  if (!resumeIds?.length || resumeIds.length < 2 || resumeIds.length > 5) {
    return NextResponse.json(
      { error: "Select 2-5 candidates to compare" },
      { status: 400 }
    );
  }

  const { data: resumes, error } = await supabase
    .from("resumes")
    .select("id, full_name, email, score, parsed_json, score_breakdown")
    .in("id", resumeIds);

  if (error || !resumes?.length) {
    return NextResponse.json({ error: "Candidates not found" }, { status: 404 });
  }

  // Get job description for context
  let jobDescription = "General candidate assessment";
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, description")
      .eq("id", jobId)
      .single();
    if (job) {
      const { descriptionText } = parseCampaignDescription(job.description);
      jobDescription = `${job.title}: ${descriptionText}`;
    }
  }

  const candidates = resumes.map((r) => {
    const p = r.parsed_json || {};
    return {
      id: r.id,
      name: r.full_name || p.full_name || "Unknown",
      score: r.score,
      skills: p.skills || [],
      yearsExperience: p.years_experience || 0,
      location: p.candidate_location || null,
      summary: p.summary || null,
      experience: (p.experience || []).map((e: any) => ({
        role: e.role,
        company: e.company,
        duration: e.duration,
      })),
      education: p.education || [],
      certifications: p.certifications || [],
      strengths: r.score_breakdown?.strengths || p.scoring?.breakdown?.strengths || [],
      weaknesses: r.score_breakdown?.weaknesses || p.scoring?.breakdown?.weaknesses || [],
    };
  });

  const startTime = Date.now();
  const result = await compareWithClaude(candidates, jobDescription);
  const duration = Date.now() - startTime;

  await logAICall(supabase, {
    owner_id: auth.user.id,
    provider: "claude",
    model: "claude-sonnet-4-20250514",
    feature: "compare",
    input_summary: `Compare ${resumeIds.length} candidates`,
    success: result.success,
    latency_ms: duration,
    error: result.success ? undefined : result.error,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data });
}
