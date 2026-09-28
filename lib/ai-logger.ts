import { SupabaseClient } from "@supabase/supabase-js";

export type AILogEntry = {
  owner_id: string;
  provider: "openai" | "claude" | "gemini";
  model: string;
  feature: string; // e.g., "parse", "score", "copilot", "compare", "smart-questions", "rag-search"
  input_summary?: string;
  output_summary?: string;
  success: boolean;
  latency_ms: number;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  error?: string;
};

export async function logAICall(
  supabase: SupabaseClient,
  entry: AILogEntry
): Promise<void> {
  try {
    await supabase.from("ai_logs").insert({
      owner_id: entry.owner_id,
      provider: entry.provider,
      model: entry.model,
      feature: entry.feature,
      input_summary: entry.input_summary || null,
      output_summary: entry.output_summary || null,
      success: entry.success,
      latency_ms: entry.latency_ms,
      tokens_input: entry.tokens_input || null,
      tokens_output: entry.tokens_output || null,
      cost_usd: entry.cost_usd || null,
      error: entry.error || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Non-blocking — logging should never break the main flow
    console.error("[AI Logger] Failed to log:", e);
  }
}
