import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseCampaignDescription } from "@/lib/campaign";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let body: { resumeId?: string; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { resumeId, jobId } = body;
  if (!resumeId || !jobId) {
    return NextResponse.json(
      { error: "resumeId and jobId are required" },
      { status: 400 }
    );
  }

  // Fetch candidate's parsed resume data
  const { data: resume, error: resumeErr } = await supabase
    .from("resumes")
    .select("parsed_json")
    .eq("id", resumeId)
    .single();

  if (resumeErr || !resume) {
    return NextResponse.json(
      { error: resumeErr?.message || "Resume not found" },
      { status: 404 }
    );
  }

  const parsedResume = resume.parsed_json;
  if (!parsedResume) {
    return NextResponse.json(
      { error: "Resume has not been parsed yet" },
      { status: 400 }
    );
  }

  // Fetch job description
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("title, company, location, description")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message || "Job not found" },
      { status: 404 }
    );
  }

  // Extract the plain description text before ---KEYWORDS--- and ---AI_SCREENING--- markers
  const { descriptionText } = parseCampaignDescription(job.description);

  const resumeSnapshot = JSON.stringify(
    {
      full_name: parsedResume.full_name,
      email: parsedResume.email,
      phone: parsedResume.phone,
      skills: parsedResume.skills,
      experience: parsedResume.experience,
      education: parsedResume.education,
      projects: parsedResume.projects,
      certifications: parsedResume.certifications,
      summary: parsedResume.summary,
      years_experience: parsedResume.years_experience,
      visa_status: parsedResume.visa_status,
      work_authorization: parsedResume.work_authorization,
    },
    null,
    2
  );

  const jobSnapshot = JSON.stringify(
    {
      title: job.title,
      company: job.company,
      location: job.location,
      description: descriptionText,
    },
    null,
    2
  );

  const systemPrompt = `You are an expert technical recruiter conducting a pre-screening interview. Your task is to analyze a candidate's resume against a specific job description and generate personalized, targeted screening questions.

Instructions:
- Carefully compare the resume to the job requirements.
- Identify gaps, unclear areas, and points that need verification.
- Generate 5 to 7 specific, personalized questions. Do NOT ask generic questions that could apply to any candidate.
- Focus on the following areas (in order of priority):
  1. Employment gaps: If there are time gaps between roles, ask about them specifically with dates.
  2. Skill depth verification: For skills listed that are critical to the job, ask questions that probe actual proficiency level (e.g., "You list React - can you describe a complex component architecture you built?").
  3. Experience alignment: Where the candidate's experience does not directly match the job title or domain, ask how their experience transfers.
  4. Project relevance: Ask about specific projects from their resume that relate to the job requirements.
  5. Work authorization: If visa_status or work_authorization is null or unclear, ask about their work authorization status for the job location.
  6. Availability: Ask about start date and notice period.
  7. Salary expectations: Ask about compensation expectations for the role.

Rules:
- Reference specific details from the resume (company names, project names, technologies, dates) in your questions.
- Each question must be different in focus - do not repeat the same theme.
- Skip any focus area that is already clearly addressed in the resume.
- Return ONLY valid JSON with the structure specified below.

Required JSON structure:
{
  "questions": ["string", "string", ...],
  "reasoning": ["string", "string", ...]
}

The "questions" array contains the screening questions (5-7 items).
The "reasoning" array contains explanations for why each corresponding question matters (same length as questions, each entry explains the question at the same index).`;

  const userPrompt = `Candidate Resume:
${resumeSnapshot}

Job Description:
${jobSnapshot}

Generate personalized screening questions for this candidate for this specific role.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const responseText = response.choices[0]?.message?.content;
    if (!responseText) {
      return NextResponse.json(
        { error: "Empty response from OpenAI" },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(responseText.trim());

    // Validate the response structure
    if (
      !Array.isArray(parsed.questions) ||
      !Array.isArray(parsed.reasoning) ||
      parsed.questions.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid response structure from OpenAI" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      questions: parsed.questions,
      reasoning: parsed.reasoning,
    });
  } catch (error: any) {
    console.error("Smart questions generation failed:", error);

    const status = error?.status ?? error?.statusCode;
    if (status === 429) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again in a moment." },
        { status: 429 }
      );
    }
    if (status === 401) {
      return NextResponse.json(
        { error: "Invalid OpenAI API key." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate screening questions. Please try again." },
      { status: 500 }
    );
  }
}
