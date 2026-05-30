import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Structured error type for detailed failure reporting
export type GeminiErrorCode =
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

export type GeminiError = {
  success: false;
  code: GeminiErrorCode;
  message: string;
  retryable: boolean;
};

export type GeminiSuccess = {
  success: true;
  data: any;
};

export type GeminiResult = GeminiSuccess | GeminiError;

function classifyError(error: any): GeminiError {
  const status = error?.status ?? error?.statusCode;
  const message = error?.message ?? String(error);
  const lowerMsg = message.toLowerCase();

  // API key errors (400 or 403 with specific messages)
  if (
    status === 400 &&
    (lowerMsg.includes("api key") || lowerMsg.includes("api_key"))
  ) {
    return {
      success: false,
      code: "INVALID_API_KEY",
      message:
        "The Gemini API key is invalid or malformed. Please check your GEMINI_API_KEY in .env.local.",
      retryable: false,
    };
  }

  if (status === 403) {
    if (lowerMsg.includes("api key") || lowerMsg.includes("api_key_invalid")) {
      return {
        success: false,
        code: "INVALID_API_KEY",
        message:
          "The Gemini API key is not authorized. Verify your key has the correct permissions.",
        retryable: false,
      };
    }
    return {
      success: false,
      code: "INVALID_API_KEY",
      message: `Access denied (403): ${message}`,
      retryable: false,
    };
  }

  // Rate limiting / quota
  if (status === 429) {
    if (lowerMsg.includes("quota") || lowerMsg.includes("resource_exhausted")) {
      return {
        success: false,
        code: "QUOTA_EXCEEDED",
        message:
          "Gemini API quota has been exceeded. Wait a few minutes or upgrade your API plan.",
        retryable: true,
      };
    }
    return {
      success: false,
      code: "RATE_LIMIT",
      message:
        "Too many requests to Gemini API. The system retried automatically but the rate limit persists. Try again in a minute.",
      retryable: true,
    };
  }

  // Server errors
  if (status === 500 || status === 502 || status === 503) {
    return {
      success: false,
      code: "SERVER_ERROR",
      message: `Gemini API server error (${status}). Google's servers may be experiencing issues. Try again shortly.`,
      retryable: true,
    };
  }

  if (status === 504 || lowerMsg.includes("timeout") || lowerMsg.includes("deadline")) {
    return {
      success: false,
      code: "TIMEOUT",
      message:
        "The request to Gemini API timed out. The resume might be too large or the server is slow. Try again.",
      retryable: true,
    };
  }

  // Safety / content filter
  if (
    lowerMsg.includes("safety") ||
    lowerMsg.includes("blocked") ||
    lowerMsg.includes("finish_reason")
  ) {
    return {
      success: false,
      code: "SAFETY_BLOCKED",
      message:
        "Gemini's safety filters blocked this content. The resume may contain content flagged by the AI.",
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
      message:
        "Could not connect to Gemini API. Check your internet connection and try again.",
      retryable: true,
    };
  }

  // JSON parse errors (invalid response from Gemini)
  if (lowerMsg.includes("json") || lowerMsg.includes("unexpected token")) {
    return {
      success: false,
      code: "INVALID_RESPONSE",
      message:
        "Gemini returned an invalid response that couldn't be parsed. Try again — this is usually a one-off issue.",
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

export async function parseResumeWithGemini(
  text: string,
  jobContext: string = "Not provided",
): Promise<GeminiResult> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      success: false,
      code: "MISSING_API_KEY",
      message:
        "GEMINI_API_KEY is not configured. Add it to your .env.local file.",
      retryable: false,
    };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
      "candidate_location": "string (city, state/country) or null",
      "years_experience": number (integer, total years of relevant experience, 0 if none),
      "visa_status": "string (enum: 'citizen', 'green_card', 'h1b') or null if not explicitly stated",
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
    - For visa_status, map to 'citizen', 'green_card', or 'h1b' if possible. If uncertain or other, use null.
    - For work_authorization, map to 'authorized' if they are a citizen/GC or have a work permit. Map to 'sponsorship' if they require sponsorship.
    - years_experience should be a number.
    - SCORING: If the Job Context is "Not provided" or vague, score the candidate based on their general strength as a professional. Otherwise, strictly score their relevance to the actual job description. Be objective.
  `;

  const maxRetries = 3;
  let delay = 5000; // start with 5 seconds
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();

      // Clean up markdown code blocks if present
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      return { success: true, data: parsed };
    } catch (error: any) {
      lastError = error;

      // 429 means Rate Limit / Quota Exceeded — retry with backoff
      if (attempt <= maxRetries && error?.status === 429) {
        let waitTime = delay;
        // Try to parse Google RPC RetryInfo for exact wait time
        if (error?.errorDetails && Array.isArray(error.errorDetails)) {
          const retryInfo = error.errorDetails.find(
            (d: any) =>
              d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
          );
          if (retryInfo && typeof retryInfo.retryDelay === "string") {
            const seconds = parseInt(retryInfo.retryDelay.replace("s", ""), 10);
            if (!isNaN(seconds)) {
              waitTime = (seconds + 1) * 1000;
            }
          }
        }

        console.warn(
          `Gemini rate limit hit. Retrying in ${waitTime / 1000}s... (Attempt ${attempt} of ${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delay *= 2; // Exponential backoff for the default fallback delay
      } else if (attempt <= maxRetries && (error?.status === 500 || error?.status === 502 || error?.status === 503)) {
        // Server errors are also retryable
        console.warn(
          `Gemini server error (${error.status}). Retrying in ${delay / 1000}s... (Attempt ${attempt} of ${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        // Non-retryable or exhausted retries
        console.error("Gemini parsing failed:", error);
        return classifyError(error);
      }
    }
  }

  // Exhausted all retries
  return classifyError(lastError);
}
