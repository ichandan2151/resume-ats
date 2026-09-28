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

      const { data: updatedCall, error } = await supabase
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
        .eq("vapi_call_id", vapiCallId)
        .select("id, owner_id, resume_id, job_id, candidate_name, ended_reason")
        .single();

      if (error) {
        console.error("Webhook: failed to update voice call:", error);
      }

      // Auto-send scheduling email if the call completed normally
      if (
        updatedCall &&
        endedReason !== "assistant-error" &&
        endedReason !== "customer-did-not-answer" &&
        endedReason !== "customer-busy" &&
        durationSeconds &&
        durationSeconds > 30 // only if the call lasted more than 30 seconds (actual conversation happened)
      ) {
        try {
          await autoSendSchedulingInvite(supabase, updatedCall);
        } catch (scheduleErr) {
          console.error("Webhook: failed to auto-send scheduling invite:", scheduleErr);
        }
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

/**
 * After a successful screening call, automatically create a scheduling invite
 * and send the candidate an email with a booking link.
 */
async function autoSendSchedulingInvite(
  supabase: ReturnType<typeof getServiceSupabase>,
  call: {
    id: string;
    owner_id: string;
    resume_id: string;
    job_id: string | null;
    candidate_name: string | null;
  }
) {
  // Fetch candidate email
  const { data: resume } = await supabase
    .from("resumes")
    .select("email, parsed_json")
    .eq("id", call.resume_id)
    .single();

  if (!resume) return;

  const candidateEmail = resume.email || resume.parsed_json?.email;
  if (!candidateEmail) {
    console.log("Webhook: no email for candidate, skipping scheduling invite");
    return;
  }

  // Check if a scheduling invite was already sent for this candidate + job
  const { data: existing } = await supabase
    .from("interview_schedules")
    .select("id")
    .eq("resume_id", call.resume_id)
    .eq("owner_id", call.owner_id)
    .in("status", ["pending", "booked"])
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("Webhook: scheduling invite already exists, skipping");
    return;
  }

  // Generate default time slots: next 5 business days, 10am and 2pm
  const slots: string[] = [];
  const now = new Date();
  let day = new Date(now);
  day.setDate(day.getDate() + 1); // start tomorrow

  let added = 0;
  while (added < 5) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      // 10:00 AM
      const morning = new Date(day);
      morning.setHours(10, 0, 0, 0);
      slots.push(morning.toISOString());

      // 2:00 PM
      const afternoon = new Date(day);
      afternoon.setHours(14, 0, 0, 0);
      slots.push(afternoon.toISOString());

      added++;
    }
    day.setDate(day.getDate() + 1);
  }

  // Create the scheduling record
  const { data: schedule, error: insertErr } = await supabase
    .from("interview_schedules")
    .insert({
      owner_id: call.owner_id,
      resume_id: call.resume_id,
      job_id: call.job_id,
      voice_call_id: call.id,
      candidate_name: call.candidate_name,
      candidate_email: candidateEmail,
      available_slots: slots,
      interview_type: "video",
      duration_minutes: 30,
      status: "pending",
    })
    .select("token")
    .single();

  if (insertErr || !schedule) {
    console.error("Webhook: failed to create scheduling record:", insertErr);
    return;
  }

  // Send the scheduling email via Resend
  if (!process.env.RESEND_API_KEY) {
    console.log("Webhook: RESEND_API_KEY not set, skipping scheduling email");
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const scheduleUrl = `${appUrl}/schedule/${schedule.token}`;

  let jobTitle = "the open position";
  if (call.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", call.job_id)
      .single();
    if (job?.title) jobTitle = job.title;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.SMTP_FROM || "ATS Notifications <onboarding@resend.dev>";

  const { error: emailErr } = await resend.emails.send({
    from: fromAddress,
    to: candidateEmail,
    subject: `Schedule Your Interview — ${jobTitle}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

<tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px 32px 24px">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Interview Invitation</h1>
  <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px">You're moving forward — let's find a time!</p>
</td></tr>

<tr><td style="padding:32px">
  <p style="margin:0 0 16px;color:#27272a;font-size:15px;line-height:1.6">
    Hi${call.candidate_name ? " " + call.candidate_name : ""},
  </p>
  <p style="margin:0 0 24px;color:#3f3f46;font-size:14px;line-height:1.6">
    Thank you for completing the phone screening for <strong>${jobTitle}</strong>. We'd love to move forward with an interview! Please pick a time that works best for you.
  </p>

  <table width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin:0 0 24px">
    <tr><td style="padding:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600;width:110px">Format</td>
          <td style="padding:4px 0;color:#3f3f46;font-size:13px">Video Interview</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600">Duration</td>
          <td style="padding:4px 0;color:#3f3f46;font-size:13px">30 minutes</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600">Options</td>
          <td style="padding:4px 0;color:#3f3f46;font-size:13px">${slots.length} time slots available</td>
        </tr>
      </table>
    </td></tr>
  </table>

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:0 0 24px">
      <a href="${scheduleUrl}" style="display:inline-block;background:#7c3aed;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px">
        Choose Your Time Slot
      </a>
    </td></tr>
  </table>

  <p style="margin:0;color:#71717a;font-size:12px;line-height:1.5">
    If none of the times work, please reply to this email and we'll find alternatives.
  </p>
</td></tr>

<tr><td style="padding:0 32px 24px">
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 16px">
  <p style="margin:0;color:#a1a1aa;font-size:11px;text-align:center">Sent via Patternix Recruiting</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  });

  if (emailErr) {
    console.error("Webhook: scheduling email failed:", emailErr);
  } else {
    console.log("Webhook: scheduling email sent to", candidateEmail);
  }

  // Log the email
  await supabase.from("email_logs").insert({
    owner_id: call.owner_id,
    resume_id: call.resume_id,
    job_id: call.job_id,
    to_email: candidateEmail,
    subject: `Schedule Your Interview — ${jobTitle}`,
    body: `Auto-scheduling invite after screening call. Booking link: ${scheduleUrl}`,
    status: emailErr ? "failed" : "sent",
  });
}
