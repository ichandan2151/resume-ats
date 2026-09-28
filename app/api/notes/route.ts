import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resumeId = searchParams.get("resumeId");

  if (!resumeId) {
    return NextResponse.json(
      { error: "resumeId is required" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("candidate_notes")
    .select("*")
    .eq("owner_id", auth.user.id)
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false });

  const jobId = searchParams.get("jobId");
  if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { resumeId, jobId, content } = await req.json();

    if (!resumeId || !content) {
      return NextResponse.json(
        { error: "resumeId and content are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("candidate_notes")
      .insert({
        owner_id: auth.user.id,
        resume_id: resumeId,
        job_id: jobId || null,
        content,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ note: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
