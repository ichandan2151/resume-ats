import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { generateEmbedding, buildEmbeddingText } from "@/lib/embeddings";
import { logAICall } from "@/lib/ai-logger";

export const runtime = "nodejs";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST: Generate and store embeddings for resumes
// Body: { resumeIds: string[] } or { jobId: string } (embed all resumes in a campaign)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { resumeIds, jobId } = body as { resumeIds?: string[]; jobId?: string };

  if (!resumeIds?.length && !jobId) {
    return NextResponse.json(
      { error: "Provide resumeIds or jobId" },
      { status: 400 }
    );
  }

  // Fetch resumes
  let query = supabase
    .from("resumes")
    .select("id, job_id, parsed_json, extracted_text")
    .eq("owner_id", auth.user.id)
    .eq("status", "done");

  if (resumeIds?.length) {
    query = query.in("id", resumeIds);
  } else if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data: resumes, error } = await query;
  if (error || !resumes?.length) {
    return NextResponse.json(
      { error: "No parsed resumes found" },
      { status: 404 }
    );
  }

  const serviceSupabase = getServiceSupabase();
  let embedded = 0;
  let failed = 0;

  for (const resume of resumes) {
    const contentText = resume.parsed_json
      ? buildEmbeddingText(resume.parsed_json)
      : resume.extracted_text || "";

    if (!contentText.trim()) {
      failed++;
      continue;
    }

    const startTime = Date.now();
    const result = await generateEmbedding(contentText);
    const duration = Date.now() - startTime;

    await logAICall(supabase, {
      owner_id: auth.user.id,
      provider: "openai",
      model: "text-embedding-3-small",
      feature: "embedding",
      input_summary: `Embed resume ${resume.id}`,
      success: result.success,
      latency_ms: duration,
      error: result.success ? undefined : result.error,
    });

    if (!result.success) {
      failed++;
      continue;
    }

    const { error: upsertErr } = await serviceSupabase
      .from("resume_embeddings")
      .upsert(
        {
          owner_id: auth.user.id,
          resume_id: resume.id,
          job_id: resume.job_id,
          content_text: contentText,
          embedding: JSON.stringify(result.embedding),
          created_at: new Date().toISOString(),
        },
        { onConflict: "resume_id" }
      );

    if (upsertErr) {
      console.error("[Embeddings] Upsert error:", upsertErr);
      failed++;
    } else {
      embedded++;
    }
  }

  return NextResponse.json({
    data: { total: resumes.length, embedded, failed },
  });
}
