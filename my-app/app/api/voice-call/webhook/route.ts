import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Use service role for webhook (no user auth context)
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST: Vapi webhook - receives call events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const type = message.type;

    if (type === "end-of-call-report") {
      const vapiCallId = message.call?.id;
      if (!vapiCallId) {
        console.error("Webhook: no call ID in end-of-call-report");
        return NextResponse.json({ ok: true });
      }

      const supabase = getServiceSupabase();

      const transcript = message.artifact?.transcript || null;
      const summary = message.analysis?.summary || null;
      const structuredData = message.analysis?.structuredData || null;
      const endedReason = message.endedReason || null;
      const cost = message.cost || null;

      let durationSeconds: number | null = null;
      if (message.startedAt && message.endedAt) {
        durationSeconds = Math.round(
          (new Date(message.endedAt).getTime() -
            new Date(message.startedAt).getTime()) /
            1000
        );
      }

      const { error } = await supabase
        .from("voice_calls")
        .update({
          status: "ended",
          transcript,
          summary,
          answers: structuredData,
          ended_reason: endedReason,
          cost,
          call_duration_seconds: durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq("vapi_call_id", vapiCallId);

      if (error) {
        console.error("Webhook: failed to update voice call:", error);
      }
    } else if (type === "status-update") {
      const vapiCallId = message.call?.id;
      const status = message.status;
      if (vapiCallId && status) {
        const supabase = getServiceSupabase();
        await supabase
          .from("voice_calls")
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("vapi_call_id", vapiCallId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
