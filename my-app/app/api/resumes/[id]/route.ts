import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// DELETE /api/resumes/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Get the resume to find the storage path
  const { data: resume, error: fetchError } = await supabase
    .from("resumes")
    .select("storage_path, storage_bucket")
    .eq("id", id)
    .single();

  if (fetchError || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  // 2. Delete from Storage
  if (resume.storage_bucket && resume.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(resume.storage_bucket)
      .remove([resume.storage_path]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      // continue to delete row even if storage fails? typically yes.
    }
  }

  // 3. Delete from DB
  const { error: delError } = await supabase
    .from("resumes")
    .delete()
    .eq("id", id);

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/resumes/[id]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    // Fetch current data to merge JSON
    const { data: current, error: fetchErr } = await supabase
      .from("resumes")
      .select("parsed_json")
      .eq("id", id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const newJson = { ...current.parsed_json, ...body };

    // We also want to update top-level columns if they exist in the body,
    // to keep them in sync with the JSON for sorting/display transparency
    // IF we still use them. (We kept full_name, email, phone).
    const updates: any = {
      parsed_json: newJson,
    };

    if (body.full_name) updates.full_name = body.full_name;
    if (body.email) updates.email = body.email;
    if (body.phone) updates.phone = body.phone;

    const { error: updateError } = await supabase
      .from("resumes")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updates });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
