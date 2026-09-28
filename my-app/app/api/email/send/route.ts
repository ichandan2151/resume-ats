import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const runtime = "nodejs";

// POST: Send an email to a candidate
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { resumeId, templateId, subject, body, jobId } = (await req.json()) as {
      resumeId: string;
      templateId?: string;
      subject: string;
      body: string;
      jobId?: string;
    };

    if (!resumeId || !subject || !body) {
      return NextResponse.json(
        { error: "resumeId, subject, and body are required" },
        { status: 400 },
      );
    }

    // Fetch candidate data from resumes table
    const { data: resume, error: resumeErr } = await supabase
      .from("resumes")
      .select("id, full_name, email, parsed_json, job_id")
      .eq("id", resumeId)
      .single();

    if (resumeErr || !resume) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    const candidateEmail =
      resume.email || resume.parsed_json?.email;

    if (!candidateEmail) {
      return NextResponse.json(
        { error: "Candidate has no email address" },
        { status: 400 },
      );
    }

    const candidateName =
      resume.full_name || resume.parsed_json?.full_name || "";

    // Fetch job data for merge fields if jobId is provided
    let role = "";
    let company = "";
    const effectiveJobId = jobId || resume.job_id;

    if (effectiveJobId) {
      const { data: job } = await supabase
        .from("jobs")
        .select("title, company")
        .eq("id", effectiveJobId)
        .single();

      if (job) {
        role = job.title || "";
        company = job.company || "";
      }
    }

    // Replace merge fields in subject and body
    const mergeFields: Record<string, string> = {
      "{{name}}": candidateName,
      "{{email}}": candidateEmail,
      "{{role}}": role,
      "{{company}}": company,
    };

    let finalSubject = subject;
    let finalBody = body;

    for (const [placeholder, value] of Object.entries(mergeFields)) {
      finalSubject = finalSubject.replaceAll(placeholder, value);
      finalBody = finalBody.replaceAll(placeholder, value);
    }

    // Send the email via Resend
    let status: "sent" | "failed" = "failed";

    if (!process.env.RESEND_API_KEY) {
      console.warn("[Email] RESEND_API_KEY is not set. Email will not be sent.");
      return NextResponse.json(
        { error: "Email service is not configured. Set RESEND_API_KEY in your environment." },
        { status: 503 },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress =
      process.env.SMTP_FROM || "ATS Notifications <onboarding@resend.dev>";

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: candidateEmail,
      subject: finalSubject,
      html: finalBody,
    });

    if (sendError) {
      console.error("[Email] Resend error:", sendError);
      status = "failed";
    } else {
      console.log("[Email] Sent successfully:", sendResult?.id);
      status = "sent";
    }

    // Log the sent email in email_logs table
    const { error: logError } = await supabase.from("email_logs").insert({
      owner_id: auth.user.id,
      resume_id: resumeId,
      job_id: effectiveJobId || null,
      template_id: templateId || null,
      to_email: candidateEmail,
      subject: finalSubject,
      body: finalBody,
      status,
    });

    if (logError) {
      console.error("[Email] Failed to log email:", logError);
    }

    if (status === "failed") {
      return NextResponse.json(
        { error: "Failed to send email", logged: !logError },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult?.id,
      to: candidateEmail,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
