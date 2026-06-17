import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, company, location, description, created_at")
    .eq("id", id)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch all resumes linked to this search campaign
  const { data: jobResumes, error: fetchErr } = await supabase
    .from("resumes")
    .select("id, email, storage_path, original_filename")
    .eq("job_id", id);

  if (fetchErr) {
    return NextResponse.json(
      { error: "Failed to fetch campaign resumes: " + fetchErr.message },
      { status: 500 },
    );
  }

  // 2. Fetch all resumes in the Candidate Directory (job_id is null) for the user
  const { data: dirResumes, error: dirErr } = await supabase
    .from("resumes")
    .select("id, email, storage_path, original_filename")
    .eq("owner_id", auth.user.id)
    .is("job_id", null);

  if (dirErr) {
    return NextResponse.json(
      { error: "Failed to fetch Candidate Directory: " + dirErr.message },
      { status: 500 },
    );
  }

  // 3. Match and separate duplicates to delete vs unique ones to preserve as directory candidates
  const dirEmails = new Set<string>();
  const dirStoragePaths = new Set<string>();
  const dirFilenames = new Set<string>();

  for (const r of dirResumes || []) {
    if (r.email) dirEmails.add(r.email.trim().toLowerCase());
    if (r.storage_path) dirStoragePaths.add(r.storage_path);
    if (r.original_filename) dirFilenames.add(r.original_filename);
  }

  const idsToDelete: string[] = [];
  const idsToPreserve: string[] = [];

  for (const r of jobResumes || []) {
    const email = r.email?.trim().toLowerCase();
    const storagePath = r.storage_path;
    const filename = r.original_filename;

    let existsInDir = false;
    if (email && dirEmails.has(email)) {
      existsInDir = true;
    } else if (storagePath && dirStoragePaths.has(storagePath)) {
      existsInDir = true;
    } else if (filename && dirFilenames.has(filename)) {
      existsInDir = true;
    }

    if (existsInDir) {
      idsToDelete.push(r.id);
    } else {
      idsToPreserve.push(r.id);
    }
  }

  // Delete duplicate ones to clean up database space
  if (idsToDelete.length > 0) {
    const { error: delResError } = await supabase
      .from("resumes")
      .delete()
      .in("id", idsToDelete);

    if (delResError) {
      return NextResponse.json(
        { error: "Failed to delete duplicate resumes: " + delResError.message },
        { status: 500 },
      );
    }
  }

  // Dissociate the unique ones (set job_id = null) so they are safely kept in Candidate Directory
  if (idsToPreserve.length > 0) {
    const { error: updResError } = await supabase
      .from("resumes")
      .update({ job_id: null })
      .in("id", idsToPreserve);

    if (updResError) {
      return NextResponse.json(
        { error: "Failed to dissociate unique resumes: " + updResError.message },
        { status: 500 },
      );
    }
  }

  // 2. Delete the search campaign row from jobs table
  const { error: delErr } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("owner_id", auth.user.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
