import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch resume to get storage path
  const { data: resume, error } = await supabase
    .from("resumes")
    .select("storage_bucket, storage_path")
    .eq("id", id)
    .single();

  if (error || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  // Generate signed URL (valid for 1 hour)
  const { data: signedData, error: signError } = await supabase.storage
    .from(resume.storage_bucket)
    .createSignedUrl(resume.storage_path, 3600);

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: "Could not generate view link" },
      { status: 500 },
    );
  }

  // Redirect to the signed URL
  return NextResponse.redirect(signedData.signedUrl);
}
