import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getVapiClient } from "@/lib/vapi";

export const runtime = "nodejs";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: Get voice call details (polls Vapi for latest status)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read with user's auth (RLS enforced)
  const { data: voiceCall, error } = await supabase
    .from("voice_calls")
    .select("*")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .single();

  if (error || !voiceCall) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  // If call is still in progress, poll Vapi for updates
  if (
    voiceCall.status !== "ended" &&
    voiceCall.status !== "failed" &&
    voiceCall.vapi_call_id
  ) {
    try {
      const vapi = getVapiClient();
      const vapiCall = await vapi.calls.get({ id: voiceCall.vapi_call_id });

      const newStatus = vapiCall.status === "ended" ? "ended" : vapiCall.status;
      const updates: Record<string, any> = { status: newStatus };

      if (vapiCall.status === "ended") {
        updates.transcript = vapiCall.artifact?.transcript || null;
        updates.summary = vapiCall.analysis?.summary || null;
        updates.answers = vapiCall.analysis?.structuredData || null;
        updates.ended_reason = vapiCall.endedReason || null;
        updates.cost = vapiCall.cost || null;
        updates.updated_at = new Date().toISOString();

        if (vapiCall.startedAt && vapiCall.endedAt) {
          updates.call_duration_seconds = Math.round(
            (new Date(vapiCall.endedAt).getTime() -
              new Date(vapiCall.startedAt).getTime()) /
              1000
          );
        }
      }

      // Use service role to bypass RLS for update
      const serviceSupabase = getServiceSupabase();
      const { data: updated } = await serviceSupabase
        .from("voice_calls")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      return NextResponse.json({ data: updated || { ...voiceCall, ...updates } });
    } catch (err) {
      console.error("Failed to poll Vapi:", err);
    }
  }

  return NextResponse.json({ data: voiceCall });
}
