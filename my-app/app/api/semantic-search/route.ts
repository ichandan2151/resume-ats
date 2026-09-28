import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";
import { logAICall } from "@/lib/ai-logger";

export const runtime = "nodejs";

// POST: Semantic search across resumes using natural language
// Body: { query: string, jobId?: string, threshold?: number, limit?: number }
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { query, jobId, threshold = 0.5, limit = 20 } = body as {
    query: string;
    jobId?: string;
    threshold?: number;
    limit?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Generate embedding for the search query
  const startTime = Date.now();
  const embeddingResult = await generateEmbedding(query);
  const embeddingDuration = Date.now() - startTime;

  await logAICall(supabase, {
    owner_id: auth.user.id,
    provider: "openai",
    model: "text-embedding-3-small",
    feature: "rag-search",
    input_summary: query.slice(0, 200),
    success: embeddingResult.success,
    latency_ms: embeddingDuration,
    error: embeddingResult.success ? undefined : embeddingResult.error,
  });

  if (!embeddingResult.success) {
    return NextResponse.json({ error: embeddingResult.error }, { status: 500 });
  }

  // Call the match_resumes RPC function
  const { data: matches, error: rpcError } = await supabase.rpc("match_resumes", {
    query_embedding: JSON.stringify(embeddingResult.embedding),
    match_owner_id: auth.user.id,
    match_job_id: jobId || null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (rpcError) {
    console.error("[Semantic Search] RPC error:", rpcError);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (!matches?.length) {
    return NextResponse.json({ data: { results: [], query } });
  }

  // Fetch full resume data for matched results
  const resumeIds = matches.map((m: any) => m.resume_id);
  const { data: resumes } = await supabase
    .from("resumes")
    .select("id, full_name, email, phone, score, status, parsed_json, original_filename, created_at")
    .in("id", resumeIds);

  const resumeMap = new Map((resumes || []).map((r) => [r.id, r]));

  const results = matches.map((m: any) => {
    const resume = resumeMap.get(m.resume_id);
    const p = resume?.parsed_json || {};
    return {
      resumeId: m.resume_id,
      similarity: Math.round(m.similarity * 100) / 100,
      name: resume?.full_name || p.full_name || "Unknown",
      email: resume?.email || p.email,
      score: resume?.score,
      skills: p.skills || [],
      summary: p.summary || null,
      yearsExperience: p.years_experience || 0,
      location: p.candidate_location || null,
    };
  });

  return NextResponse.json({ data: { results, query } });
}
