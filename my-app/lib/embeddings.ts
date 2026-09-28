import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Generate embedding vector for a text using OpenAI text-embedding-3-small
export async function generateEmbedding(
  text: string
): Promise<{ success: true; embedding: number[] } | { success: false; error: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY is not configured." };
  }

  try {
    // Truncate to ~8000 tokens worth of text (roughly 32k chars)
    const truncated = text.slice(0, 32000);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: truncated,
      dimensions: 1536,
    });

    return { success: true, embedding: response.data[0].embedding };
  } catch (error: any) {
    console.error("[Embeddings] Error:", error);
    return { success: false, error: error?.message || "Embedding generation failed" };
  }
}

// Build a searchable text from parsed resume data
export function buildEmbeddingText(parsedJson: any): string {
  const parts: string[] = [];

  if (parsedJson.full_name) parts.push(`Name: ${parsedJson.full_name}`);
  if (parsedJson.summary) parts.push(`Summary: ${parsedJson.summary}`);
  if (parsedJson.skills?.length) parts.push(`Skills: ${parsedJson.skills.join(", ")}`);
  if (parsedJson.keywords?.length) parts.push(`Keywords: ${parsedJson.keywords.join(", ")}`);

  if (parsedJson.experience?.length) {
    const expText = parsedJson.experience
      .map((e: any) => `${e.role || ""} at ${e.company || ""} (${e.duration || ""}): ${e.description || ""}`)
      .join(". ");
    parts.push(`Experience: ${expText}`);
  }

  if (parsedJson.education?.length) {
    const eduText = parsedJson.education
      .map((e: any) => `${e.degree || ""} from ${e.school || ""} (${e.year || ""})`)
      .join(". ");
    parts.push(`Education: ${eduText}`);
  }

  if (parsedJson.certifications?.length) {
    const certText = parsedJson.certifications
      .map((c: any) => `${c.name || ""} by ${c.issuer || ""}`)
      .join(", ");
    parts.push(`Certifications: ${certText}`);
  }

  if (parsedJson.projects?.length) {
    const projText = parsedJson.projects
      .map((p: any) => `${p.name || ""}: ${p.description || ""} [${(p.tech_stack || []).join(", ")}]`)
      .join(". ");
    parts.push(`Projects: ${projText}`);
  }

  if (parsedJson.candidate_location) parts.push(`Location: ${parsedJson.candidate_location}`);

  return parts.join("\n");
}
