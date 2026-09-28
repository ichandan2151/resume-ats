import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET: List all email templates for the authenticated user
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id, name, subject, body, category, created_at, updated_at")
    .eq("owner_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: templates ?? [] });
}

// POST: Create a new email template
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, subject, body, category } = await req.json();

    if (!name || !subject || !body) {
      return NextResponse.json(
        { error: "name, subject, and body are required" },
        { status: 400 },
      );
    }

    const { data: template, error } = await supabase
      .from("email_templates")
      .insert({
        owner_id: auth.user.id,
        name,
        subject,
        body,
        category: category || null,
      })
      .select("id, name, subject, body, category, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
