import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST: Get comparison data for multiple candidates
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { resumeIds } = body as { resumeIds: string[] };

  if (!resumeIds?.length || resumeIds.length < 2 || resumeIds.length > 5) {
    return NextResponse.json(
      { error: "Select 2-5 candidates to compare" },
      { status: 400 }
    );
  }

  const { data: resumes, error } = await supabase
    .from("resumes")
    .select("id, full_name, email, phone, score, status, parsed_json, score_breakdown")
    .in("id", resumeIds);

  if (error || !resumes?.length) {
    return NextResponse.json({ error: "Candidates not found" }, { status: 404 });
  }

  // Fetch call history for these candidates
  const { data: calls } = await supabase
    .from("voice_calls")
    .select("resume_id, status, summary, answers")
    .in("resume_id", resumeIds)
    .eq("status", "ended");

  const callsByResume: Record<string, any[]> = {};
  (calls || []).forEach((c) => {
    if (!callsByResume[c.resume_id]) callsByResume[c.resume_id] = [];
    callsByResume[c.resume_id].push(c);
  });

  // Build comparison data
  const candidates = resumes.map((r) => {
    const p = r.parsed_json || {};
    return {
      id: r.id,
      name: r.full_name || "Unknown",
      email: r.email,
      phone: r.phone || p.phone,
      score: r.score,
      yearsExperience: p.years_experience || 0,
      location: p.candidate_location || null,
      visaStatus: p.visa_status || null,
      workAuthorization: p.work_authorization || null,
      skills: p.skills || [],
      experience: (p.experience || []).map((e: any) => ({
        role: e.role,
        company: e.company,
        duration: e.duration,
      })),
      education: (p.education || []).map((e: any) => ({
        degree: e.degree,
        school: e.school,
        year: e.year,
      })),
      certifications: (p.certifications || []).length,
      projects: (p.projects || []).length,
      summary: p.summary || null,
      scoreBreakdown: r.score_breakdown || null,
      strengths: r.score_breakdown?.strengths || p.scoring?.breakdown?.strengths || [],
      weaknesses: r.score_breakdown?.weaknesses || p.scoring?.breakdown?.weaknesses || [],
      callCount: (callsByResume[r.id] || []).length,
      latestCallSummary: callsByResume[r.id]?.[0]?.summary || null,
      latestCallAnswers: callsByResume[r.id]?.[0]?.answers || null,
    };
  });

  // Find common and unique skills
  const allSkillSets = candidates.map((c) => new Set(c.skills.map((s: string) => s.toLowerCase())));
  const commonSkills = [...allSkillSets[0]].filter((s) =>
    allSkillSets.every((set) => set.has(s))
  );
  const uniqueSkills: Record<string, string[]> = {};
  candidates.forEach((c, i) => {
    uniqueSkills[c.id] = c.skills.filter(
      (s: string) => !allSkillSets.filter((_, j) => j !== i).some((set) => set.has(s.toLowerCase()))
    );
  });

  return NextResponse.json({
    data: {
      candidates,
      commonSkills,
      uniqueSkills,
    },
  });
}
