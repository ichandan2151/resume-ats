import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateICS } from "@/lib/ics";

export const runtime = "nodejs";

// Service role client — these routes are public (no user auth)
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: Fetch scheduling info by token (public — for candidate)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceSupabase();

  const { data: schedule, error } = await supabase
    .from("interview_schedules")
    .select("id, candidate_name, candidate_email, available_slots, selected_slot, status, interview_type, duration_minutes, location, notes, job_id, created_at")
    .eq("token", token)
    .single();

  if (error || !schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  // Fetch job title for context
  let jobTitle = null;
  if (schedule.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, company")
      .eq("id", schedule.job_id)
      .single();
    if (job) {
      jobTitle = job.title;
    }
  }

  return NextResponse.json({
    data: {
      ...schedule,
      job_title: jobTitle,
    },
  });
}

// PATCH: Candidate books a slot (public)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = getServiceSupabase();

  const { selectedSlot } = (await req.json()) as { selectedSlot: string };

  if (!selectedSlot) {
    return NextResponse.json({ error: "selectedSlot is required" }, { status: 400 });
  }

  // Fetch current schedule
  const { data: schedule, error: fetchErr } = await supabase
    .from("interview_schedules")
    .select("*")
    .eq("token", token)
    .single();

  if (fetchErr || !schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  if (schedule.status === "booked") {
    return NextResponse.json({ error: "This interview is already booked" }, { status: 409 });
  }

  if (schedule.status === "cancelled") {
    return NextResponse.json({ error: "This interview has been cancelled" }, { status: 410 });
  }

  // Validate the selected slot is in the available slots
  const slots = schedule.available_slots as string[];
  if (!slots.includes(selectedSlot)) {
    return NextResponse.json({ error: "Invalid time slot" }, { status: 400 });
  }

  // Update to booked
  const { data: updated, error: updateErr } = await supabase
    .from("interview_schedules")
    .update({
      selected_slot: selectedSlot,
      status: "booked",
      updated_at: new Date().toISOString(),
    })
    .eq("token", token)
    .eq("status", "pending") // prevent race condition
    .select()
    .single();

  if (updateErr || !updated) {
    return NextResponse.json({ error: "Failed to book slot" }, { status: 500 });
  }

  // Fetch job info for ICS
  let jobTitle = "Interview";
  if (schedule.job_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", schedule.job_id)
      .single();
    if (job?.title) jobTitle = `Interview — ${job.title}`;
  }

  // Generate ICS file content
  const icsContent = generateICS({
    title: jobTitle,
    description: schedule.notes
      ? `Interview Details:\n${schedule.notes}\n\nType: ${schedule.interview_type}\nDuration: ${schedule.duration_minutes} minutes${schedule.location ? `\nLocation: ${schedule.location}` : ""}`
      : `${schedule.interview_type} interview (${schedule.duration_minutes} min)${schedule.location ? ` at ${schedule.location}` : ""}`,
    location: schedule.location || undefined,
    startTime: new Date(selectedSlot),
    durationMinutes: schedule.duration_minutes,
    attendeeEmail: schedule.candidate_email,
  });

  // Send confirmation email to candidate with .ics attachment
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddress =
        process.env.SMTP_FROM || "ATS Notifications <onboarding@resend.dev>";

      const slotDate = new Date(selectedSlot);
      const dateStr = slotDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const timeStr = slotDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      await resend.emails.send({
        from: fromAddress,
        to: schedule.candidate_email,
        subject: `Interview Confirmed — ${dateStr} at ${timeStr}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

<tr><td style="background:linear-gradient(135deg,#059669,#047857);padding:32px 32px 24px">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Interview Confirmed!</h1>
  <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px">Your interview has been scheduled</p>
</td></tr>

<tr><td style="padding:32px">
  <p style="margin:0 0 16px;color:#27272a;font-size:15px;line-height:1.6">
    Hi${schedule.candidate_name ? " " + schedule.candidate_name : ""},
  </p>
  <p style="margin:0 0 24px;color:#3f3f46;font-size:14px;line-height:1.6">
    Your interview is confirmed. Here are the details:
  </p>

  <table width="100%" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;margin:0 0 24px">
    <tr><td style="padding:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600;width:100px">Date</td>
          <td style="padding:6px 0;color:#27272a;font-size:14px;font-weight:600">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600">Time</td>
          <td style="padding:6px 0;color:#27272a;font-size:14px;font-weight:600">${timeStr}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600">Duration</td>
          <td style="padding:6px 0;color:#3f3f46;font-size:13px">${schedule.duration_minutes} minutes</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600">Format</td>
          <td style="padding:6px 0;color:#3f3f46;font-size:13px">${(schedule.interview_type as string).charAt(0).toUpperCase() + (schedule.interview_type as string).slice(1)}</td>
        </tr>
        ${schedule.location ? `<tr><td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600">Location</td><td style="padding:6px 0;color:#3f3f46;font-size:13px">${schedule.location}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>

  ${schedule.notes ? `<p style="margin:0 0 20px;color:#3f3f46;font-size:13px;line-height:1.6;background:#f4f4f5;padding:12px 16px;border-radius:8px"><strong>Preparation notes:</strong><br>${schedule.notes}</p>` : ""}

  <p style="margin:0 0 8px;color:#71717a;font-size:12px">A calendar invite (.ics) is attached to this email. Add it to your calendar so you don't forget!</p>
  <p style="margin:0;color:#71717a;font-size:12px">If you need to reschedule, please reply to this email.</p>
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
        attachments: [
          {
            filename: "interview.ics",
            content: Buffer.from(icsContent).toString("base64"),
            contentType: "text/calendar",
          },
        ],
      });
    } catch (emailErr) {
      console.error("[Schedule] Confirmation email error:", emailErr);
    }
  }

  return NextResponse.json({
    data: updated,
    ics: icsContent,
  });
}
