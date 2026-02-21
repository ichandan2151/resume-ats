import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function parseResumeWithGemini(
  text: string,
  jobContext: string = "Not provided",
) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set. Skipping Gemini parsing.");
    return null;
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

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Clean up markdown code blocks if present
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonStr);
    } catch (error: any) {
      // 429 means Rate Limit / Quota Exceeded
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
      } else {
        console.error("Gemini parsing failed:", error);
        return null;
      }
    }
  }
  return null;
}
