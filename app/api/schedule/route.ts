import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST: Create a new interview scheduling invite (authenticated recruiter)
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      resumeId,
      jobId,
      voiceCallId,
      availableSlots,
      interviewType,
      durationMinutes,
      location,
      notes,
    } = (await req.json()) as {
      resumeId: string;
      jobId?: string;
      voiceCallId?: string;
      availableSlots: string[]; // ISO date strings
      interviewType?: string;
      durationMinutes?: number;
      location?: string;
      notes?: string;
    };

    if (!resumeId || !availableSlots?.length) {
      return NextResponse.json(
        { error: "resumeId and availableSlots are required" },
        { status: 400 }
      );
    }

    // Fetch candidate info
    const { data: resume, error: resumeErr } = await supabase
      .from("resumes")
      .select("id, full_name, email, parsed_json, job_id")
      .eq("id", resumeId)
      .single();

    if (resumeErr || !resume) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const candidateEmail = resume.email || resume.parsed_json?.email;
    if (!candidateEmail) {
      return NextResponse.json(
        { error: "Candidate has no email address" },
        { status: 400 }
      );
    }

    const candidateName = resume.full_name || resume.parsed_json?.full_name || "";

    const { data: schedule, error: insertErr } = await supabase
      .from("interview_schedules")
      .insert({
        owner_id: auth.user.id,
        resume_id: resumeId,
        job_id: jobId || resume.job_id || null,
        voice_call_id: voiceCallId || null,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        available_slots: availableSlots,
        interview_type: interviewType || "video",
        duration_minutes: durationMinutes || 30,
        location: location || null,
        notes: notes || null,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[Schedule] Insert error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Send scheduling email to candidate
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const scheduleUrl = `${appUrl}/schedule/${schedule.token}`;

    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddress =
        process.env.SMTP_FROM || "ATS Notifications <onboarding@resend.dev>";

      // Fetch job info for context
      let jobTitle = "the open position";
      const effectiveJobId = jobId || resume.job_id;
      if (effectiveJobId) {
        const { data: job } = await supabase
          .from("jobs")
          .select("title, company")
          .eq("id", effectiveJobId)
          .single();
        if (job?.title) jobTitle = job.title;
      }

      const slotCount = availableSlots.length;
      const interviewDuration = durationMinutes || 30;
      const type = interviewType || "video";

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
    Hi${candidateName ? " " + candidateName : ""},
  </p>
  <p style="margin:0 0 24px;color:#3f3f46;font-size:14px;line-height:1.6">
    Thank you for completing the phone screening for <strong>${jobTitle}</strong>. We'd love to move forward with an interview!
  </p>

  <table width="100%" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;margin:0 0 24px">
    <tr><td style="padding:20px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600;width:110px">Format</td>
          <td style="padding:4px 0;color:#3f3f46;font-size:13px">${type.charAt(0).toUpperCase() + type.slice(1)} Interview</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600">Duration</td>
          <td style="padding:4px 0;color:#3f3f46;font-size:13px">${interviewDuration} minutes</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600">Options</td>
          <td style="padding:4px 0;color:#3f3f46;font-size:13px">${slotCount} time slot${slotCount !== 1 ? "s" : ""} available</td>
        </tr>
        ${location ? `<tr><td style="padding:4px 0;color:#6b21a8;font-size:13px;font-weight:600">Location</td><td style="padding:4px 0;color:#3f3f46;font-size:13px">${location}</td></tr>` : ""}
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

  ${notes ? `<p style="margin:0 0 16px;color:#3f3f46;font-size:13px;line-height:1.6;background:#f4f4f5;padding:12px 16px;border-radius:8px"><strong>Preparation notes:</strong><br>${notes}</p>` : ""}

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
        console.error("[Schedule] Failed to send email:", emailErr);
      }

      // Log the email
      await supabase.from("email_logs").insert({
        owner_id: auth.user.id,
        resume_id: resumeId,
        job_id: effectiveJobId || null,
        to_email: candidateEmail,
        subject: `Schedule Your Interview — ${jobTitle}`,
        body: `Interview scheduling invite sent. Booking link: ${scheduleUrl}`,
        status: emailErr ? "failed" : "sent",
      });
    }

    return NextResponse.json({ data: schedule });
  } catch (e: any) {
    console.error("[Schedule] Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET: List interview schedules for current user
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resumeId = searchParams.get("resumeId");

  let query = supabase
    .from("interview_schedules")
    .select("*")
    .eq("owner_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (resumeId) {
    query = query.eq("resume_id", resumeId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
