import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export type OpenAIErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "RATE_LIMIT"
  | "QUOTA_EXCEEDED"
  | "SERVER_ERROR"
  | "TIMEOUT"
  | "SAFETY_BLOCKED"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export type OpenAIError = {
  success: false;
  code: OpenAIErrorCode;
  message: string;
  retryable: boolean;
};

export type OpenAISuccess = {
  success: true;
  data: any;
};

export type OpenAIResult = OpenAISuccess | OpenAIError;

function classifyError(error: any): OpenAIError {
  const status = error?.status ?? error?.statusCode;
  const message = error?.message ?? String(error);
  const code = error?.code;
  const lowerMsg = message.toLowerCase();

  // API key errors
  if (
    status === 401 ||
    code === "invalid_api_key" ||
    lowerMsg.includes("api key") ||
    lowerMsg.includes("api_key")
  ) {
    return {
      success: false,
      code: "INVALID_API_KEY",
      message: "The OpenAI API key is invalid, unauthorized, or malformed. Please check your OPENAI_API_KEY in .env.local.",
      retryable: false,
    };
  }

  // Rate limiting / quota
  if (status === 429) {
    if (code === "insufficient_quota" || lowerMsg.includes("quota") || lowerMsg.includes("credit")) {
      return {
        success: false,
        code: "QUOTA_EXCEEDED",
        message: "OpenAI API quota has been exceeded or account credits ran out. Please upgrade your OpenAI billing plan.",
        retryable: false,
      };
    }
    return {
      success: false,
      code: "RATE_LIMIT",
      message: "Too many requests to OpenAI API. The rate limit has been exceeded. Try again in a minute.",
      retryable: true,
    };
  }

  // Server errors
  if (status >= 500) {
    return {
      success: false,
      code: "SERVER_ERROR",
      message: `OpenAI API server error (${status}). OpenAI's servers may be experiencing issues. Try again shortly.`,
      retryable: true,
    };
  }

  // Timeout
  if (
    status === 408 ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("deadline") ||
    error?.name === "AbortError"
  ) {
    return {
      success: false,
      code: "TIMEOUT",
      message: "The request to OpenAI API timed out. The resume might be too large or the server is slow. Try again.",
      retryable: true,
    };
  }

  // Safety / content filter
  if (
    code === "content_policy_violation" ||
    lowerMsg.includes("safety") ||
    lowerMsg.includes("policy violation")
  ) {
    return {
      success: false,
      code: "SAFETY_BLOCKED",
      message: "OpenAI's safety filters blocked this content. The resume may contain content flagged by safety policy.",
      retryable: false,
    };
  }

  // Network errors
  if (
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("econnrefused") ||
    lowerMsg.includes("enotfound") ||
    lowerMsg.includes("network")
  ) {
    return {
      success: false,
      code: "NETWORK_ERROR",
      message: "Could not connect to OpenAI API. Check your internet connection and try again.",
      retryable: true,
    };
  }

  // JSON parse errors
  if (lowerMsg.includes("json") || lowerMsg.includes("unexpected token")) {
    return {
      success: false,
      code: "INVALID_RESPONSE",
      message: "OpenAI returned an invalid response that couldn't be parsed. Try again — this is usually a one-off issue.",
      retryable: true,
    };
  }

  // Fallback
  return {
    success: false,
    code: "UNKNOWN",
    message: `An unexpected error occurred: ${message}`,
    retryable: true,
  };
}

export async function parseResumeWithOpenAI(
  text: string,
  jobContext: string = "Not provided",
  maxRetries = 4,
  initialDelayMs = 2000,
): Promise<OpenAIResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      message: "OPENAI_API_KEY is not configured. Add it to your .env.local file.",
      retryable: false,
    };
  }

  const prompt = `
    You are an expert technical recruiter and AI resume parser. 
    Your task is to extract information from the resume text and evaluate how well the candidate matches the Job Context provided.
    
    Job Context:
    """
    ${jobContext}
    """

    Resume Text:
    """
    ${text.slice(0, 20000)}
    """

    Return ONLY valid JSON with exactly the structure below. Do not include markdown formatting like \`\`\`json.
    
    Required JSON Structure:
    {
      "full_name": "string or null",
      "email": "string or null",
      "phone": "string or null",
      "linkedin": "string (LinkedIn profile URL or username) or null",
      "candidate_location": "string (city, state/country) or null",
      "years_experience": number (integer, total years of relevant experience, 0 if none),
      "visa_status": "string (enum: 'citizen', 'green_card', 'h1b', 'opt', 'stem_opt', 'cpt') or null if not explicitly stated",
      "work_authorization": "string (enum: 'authorized', 'sponsorship') or null if not explicitly stated",
      "skills": ["string", "string"],
      "summary": "string (brief summary of the candidate) or null",
      "experience": [
        {
          "role": "string or null",
          "company": "string or null",
          "duration": "string or null",
          "description": "string or null"
        }
      ],
      "education": [
        {
          "degree": "string or null",
          "school": "string or null",
          "year": "string or null"
        }
      ],
      "projects": [
        {
          "name": "string or null",
          "description": "string or null",
          "tech_stack": ["string"]
        }
      ],
      "certifications": [
        {
          "name": "string or null",
          "issuer": "string or null",
          "year": "string or null"
        }
      ],
      "publications": [
        {
          "title": "string or null",
          "link": "string or null",
          "year": "string or null"
        }
      ],
      "scoring": {
        "score": number (0 to 100 representing how well the candidate matches the Job Context),
        "breakdown": {
          "relevance": "string (1-2 sentences explaining why they do or do not match the job requirements)",
          "strengths": ["string (key strengths for this specific role)"],
          "weaknesses": ["string (missing skills or experience required by the role)"]
        }
      }
    }

    Rules:
    - For visa_status, map to 'citizen', 'green_card', 'h1b', 'opt', 'stem_opt', or 'cpt' if possible. If uncertain or other, use null.
    - For work_authorization, map to 'authorized' if they are a citizen/GC or have a work permit. Map to 'sponsorship' if they require sponsorship.
    - years_experience should be a number.
    - SCORING: If the Job Context is "Not provided" or vague, score the candidate based on their general strength as a professional. Otherwise, strictly score their relevance to the actual job description. Be objective.
  `;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a professional assistant specialized in parsing resumes into structured JSON formats.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error("Empty response from OpenAI");
      }

      const parsed = JSON.parse(responseText.trim());
      return { success: true, data: parsed };
    } catch (error: any) {
      const classified = classifyError(error);
      if (classified.retryable && attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `OpenAI parsing transient error (code: ${classified.code}). Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      console.error(`OpenAI parsing failed after ${attempt} attempt(s):`, error);
      return classified;
    }
  }
}
