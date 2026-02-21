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

  // 1. Fetch all resumes for this job to get their storage paths
  const { data: resumes, error: fetchErr } = await supabase
    .from("resumes")
    .select("storage_bucket, storage_path")
    .eq("job_id", jobId);

  if (fetchErr) {
    return NextResponse.json(
      { error: "Failed to fetch resumes" },
      { status: 500 },
    );
  }

  // 2. Delete files from storage
  if (resumes && resumes.length > 0) {
    const paths = resumes
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p);

    // Deleting in batches if needed, but for now allow all
    if (paths.length > 0) {
      // Assume all are in "resumes" bucket for now or check r.storage_bucket
      const bucket = resumes[0].storage_bucket || "resumes";
      const { error: storageErr } = await supabase.storage
        .from(bucket)
        .remove(paths);

      if (storageErr) {
        console.error("Failed to delete files", storageErr);
        // continue to delete rows anyway? Yes, to avoid inconsistency.
      }
    }
  }

  // 3. Delete the job (cascade should handle resumes, but let's be safe/explicit if needed)
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
