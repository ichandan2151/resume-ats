import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export type LLMProvider = "openai" | "claude";

export async function analyzeWithClaude(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "ANTHROPIC_API_KEY is not configured." };
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.1,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { success: false, error: "Empty response from Claude" };
    }

    // Try to parse as JSON, otherwise return raw text
    const raw = textBlock.text.trim();
    try {
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : raw;
      const parsed = JSON.parse(jsonStr);
      return { success: true, data: parsed };
    } catch {
      return { success: true, data: raw };
    }
  } catch (error: any) {
    const status = error?.status;
    if (status === 401) {
      return { success: false, error: "Invalid Anthropic API key." };
    }
    if (status === 429) {
      return { success: false, error: "Claude rate limit exceeded. Try again shortly." };
    }
    return { success: false, error: error?.message || "Claude API error" };
  }
}

// Claude-powered candidate comparison with deeper analysis
export async function compareWithClaude(
  candidates: any[],
  jobDescription: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  const systemPrompt = `You are an expert talent analyst and recruiter. Analyze and compare candidates against the job requirements. Provide deep, actionable insights — not just surface-level comparisons.

Return ONLY valid JSON with this structure:
{
  "ranking": [
    {
      "candidateId": "string",
      "rank": number,
      "overallFit": number (0-100),
      "verdict": "strong_match" | "good_match" | "partial_match" | "weak_match",
      "standoutFactor": "string (one sentence — what makes this candidate unique)",
      "riskFactors": ["string (potential concerns)"],
      "interviewFocus": ["string (key areas to probe in interview)"]
    }
  ],
  "comparativeInsights": {
    "bestForTechnical": "candidateId",
    "bestForExperience": "candidateId",
    "bestForCultureFit": "candidateId",
    "biggestUpside": "candidateId",
    "recommendation": "string (2-3 sentences — who to advance and why)"
  }
}`;

  const userPrompt = `Job Description:
${jobDescription}

Candidates:
${JSON.stringify(candidates, null, 2)}

Rank these candidates and provide comparative analysis.`;

  return analyzeWithClaude(systemPrompt, userPrompt, { temperature: 0.2 });
}

// Claude-powered copilot for natural language queries about candidates
export async function copilotQuery(
  query: string,
  context: { candidates: any[]; jobTitle?: string; jobDescription?: string }
): Promise<{ success: true; data: string } | { success: false; error: string }> {
  const systemPrompt = `You are an AI recruiting copilot embedded in an ATS (Applicant Tracking System).
You help recruiters understand their candidate pipeline through natural language.

You have access to candidate data for the current campaign. Answer questions concisely and actionably.
When referencing candidates, use their names. Format your response in clean markdown.
If the user asks something you cannot determine from the data, say so clearly.`;

  const userPrompt = `${context.jobTitle ? `Current Campaign: ${context.jobTitle}` : ""}
${context.jobDescription ? `Job Description: ${context.jobDescription}` : ""}

Candidate Data:
${JSON.stringify(context.candidates, null, 2)}

Recruiter Question: ${query}`;

  const result = await analyzeWithClaude(systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 2048,
  });

  if (!result.success) return result;
  // Copilot returns markdown text, not JSON
  const text = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
  return { success: true, data: text };
}
