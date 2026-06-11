import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company, location, description, created_at")
    .eq("id", jobId)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Dissociate resumes from the job so they are not deleted by CASCADE and remain in Candidate Directory
  const { error: updateErr } = await supabase
    .from("resumes")
    .update({ job_id: null })
    .eq("job_id", jobId);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to dissociate resumes from job: " + updateErr.message },
      { status: 500 },
    );
  }

  // 2. Delete the job row
  const { error: delErr } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("owner_id", auth.user.id); // security check

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
