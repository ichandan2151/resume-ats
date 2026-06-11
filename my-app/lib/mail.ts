import nodemailer from "nodemailer";
import { Resend } from "resend";

export interface NotificationResume {
  fileName: string;
  status: "scored" | "error" | string;
  score: number | null;
  candidateName: string | null;
  error: string | null;
}

interface SendEmailParams {
  toEmail: string;
  fullName: string | null;
  jobTitle: string;
  jobId: string;
  resumes: NotificationResume[];
}

export async function sendResumeStatusNotification({
  toEmail,
  fullName,
  jobTitle,
  jobId,
  resumes,
}: SendEmailParams) {
  if (resumes.length === 0) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const jobLink = `${appUrl}/jobs/${jobId}`;

  // Count successes and failures
  const processedCount = resumes.filter((r) => r.status === "scored").length;
  const failedCount = resumes.filter((r) => r.status === "error").length;

  const greeting = fullName ? `Hi ${fullName},` : "Hello,";

  // Build the resume list HTML with premium styling
  const resumesHtml = resumes
    .map((r) => {
      let scoreBadge = "";
      if (r.status === "scored" && r.score !== null) {
        let badgeColor = "#ef4444"; // red
        let badgeBg = "#fef2f2";
        if (r.score >= 80) {
          badgeColor = "#10b981"; // green
          badgeBg = "#ecfdf5";
        } else if (r.score >= 50) {
          badgeColor = "#f59e0b"; // amber
          badgeBg = "#fffbeb";
        }
        scoreBadge = `
          <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 9999px; background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}22;">
            Score: ${r.score}/100
          </span>
        `;
      } else {
        scoreBadge = `
          <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 9999px; background-color: #fef2f2; color: #ef4444; border: 1px solid #ef444422;">
            Failed
          </span>
        `;
      }

      const candidateDetail = r.candidateName
        ? `<strong style="color: #18181b;">${r.candidateName}</strong>`
        : `<span style="color: #71717a; font-style: italic;">Unknown Candidate</span>`;

      const subText = r.status === "scored"
        ? `<div style="font-size: 12px; color: #71717a; margin-top: 2px;">File: ${r.fileName}</div>`
        : `<div style="font-size: 12px; color: #ef4444; margin-top: 2px;">Error: ${r.error || "Parsing failed"}</div>`;

      return `
        <tr style="border-bottom: 1px solid #e4e4e7;">
          <td style="padding: 16px 12px; font-family: sans-serif; font-size: 14px; text-align: left; vertical-align: middle;">
            ${candidateDetail}
            ${subText}
          </td>
          <td style="padding: 16px 12px; font-family: sans-serif; text-align: right; vertical-align: middle;">
            ${scoreBadge}
          </td>
        </tr>
      `;
    })
    .join("");

  const emailSubject = `Resume Parsing Completed for ${jobTitle}`;

  // Premium, modern, responsive HTML body
  const emailHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${emailSubject}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5; padding: 32px 16px;">
        <tr>
          <td align="center">
            <!-- Container Table -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e4e4e7;">
              
              <!-- Header Gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px; text-align: center;">
                  <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em; text-transform: uppercase;">
                    Resume ATS Notification
                  </h1>
                </td>
              </tr>
              
              <!-- Content Body -->
              <tr>
                <td style="padding: 32px 24px;">
                  <p style="margin-top: 0; margin-bottom: 16px; font-size: 16px; line-height: 24px; color: #3f3f46; font-weight: 500;">
                    ${greeting}
                  </p>
                  <p style="margin-top: 0; margin-bottom: 24px; font-size: 15px; line-height: 24px; color: #71717a;">
                    Resume parsing and Gemini evaluation has completed for your job opening <strong>${jobTitle}</strong>. 
                    Here is a summary of the results:
                  </p>
                  
                  <!-- Stat Cards -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                    <tr>
                      <td width="48%" style="background-color: #ecfdf5; border: 1px solid #10b98122; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: #047857;">${processedCount}</div>
                        <div style="font-size: 12px; color: #047857; font-weight: 500; margin-top: 2px;">Parsed Successfully</div>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" style="background-color: ${failedCount > 0 ? "#fef2f2" : "#f4f4f5"}; border: 1px solid ${failedCount > 0 ? "#ef444422" : "#e4e4e7"}; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: ${failedCount > 0 ? "#b91c1c" : "#71717a"};">${failedCount}</div>
                        <div style="font-size: 12px; color: ${failedCount > 0 ? "#b91c1c" : "#71717a"}; font-weight: 500; margin-top: 2px;">Failed</div>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Candidates Table -->
                  <h3 style="font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #a1a1aa; margin-top: 32px; margin-bottom: 12px;">
                    Candidates List
                  </h3>
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; width: 100%; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden; margin-bottom: 32px;">
                    <tbody>
                      ${resumesHtml}
                    </tbody>
                  </table>
                  
                  <!-- Button CTA -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px;">
                    <tr>
                      <td align="center">
                        <a href="${jobLink}" target="_blank" style="display: inline-block; background-color: #18181b; color: #ffffff; font-family: sans-serif; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 8px; border: 1px solid #18181b; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                          View Candidates Dashboard
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #fafafa; border-top: 1px solid #e4e4e7; padding: 24px 32px; text-align: center;">
                  <p style="margin: 0; font-size: 12px; color: #a1a1aa; line-height: 18px;">
                    This email is automated. Please do not reply directly.
                  </p>
                  <p style="margin: 4px 0 0 0; font-size: 12px; color: #a1a1aa; line-height: 18px;">
                    &copy; ${new Date().getFullYear()} Resume ATS. All rights reserved.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  // 1) Try Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[Mail] Sending notification via Resend to: ${toEmail}`);
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: process.env.SMTP_FROM || "ATS Notifications <onboarding@resend.dev>",
        to: toEmail,
        subject: emailSubject,
        html: emailHtml,
      });

      if (error) {
        console.error("[Mail] Resend error:", error);
      } else {
        console.log("[Mail] Resend email sent successfully:", data?.id);
        return { success: true, provider: "resend" };
      }
    } catch (err) {
      console.error("[Mail] Resend client execution failed:", err);
    }
  }

  // 2) Try Nodemailer / SMTP Fallback
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  ) {
    try {
      console.log(`[Mail] Sending notification via SMTP to: ${toEmail}`);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"ATS Notifications" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log("[Mail] SMTP email sent successfully:", info.messageId);
      return { success: true, provider: "nodemailer" };
    } catch (err) {
      console.error("[Mail] SMTP client execution failed:", err);
    }
  }

  // 3) Fallback: No credentials
  console.warn(
    `[Mail] Email NOT sent. Neither RESEND_API_KEY nor SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) are set in .env.local. Recipient: ${toEmail}`
  );
  return { success: false, reason: "credentials_missing" };
}

export async function checkAndSendJobNotification(
  supabaseAdmin: any,
  userId: string,
  jobId: string | null
) {
  if (!jobId) return;

  try {
    // 1. Check if there are any resumes for this job still processing
    const { data: processingResumes, error: procErr } = await supabaseAdmin
      .from("resumes")
      .select("id")
      .eq("job_id", jobId)
      .eq("status", "uploaded");

    if (procErr) {
      console.error("[Mail] Error checking processing resumes:", procErr);
      return;
    }

    // If there are still processing resumes, do nothing
    if (processingResumes && processingResumes.length > 0) {
      console.log(`[Mail] Job ${jobId} has ${processingResumes.length} resumes still processing. Delaying notification.`);
      return;
    }

    // 2. No resumes are processing. Let's find scored/error resumes for this job.
    const { data: resumes, error: resErr } = await supabaseAdmin
      .from("resumes")
      .select("id, original_filename, status, score, parsed_json")
      .eq("job_id", jobId)
      .in("status", ["scored", "error"]);

    if (resErr || !resumes) {
      console.error("[Mail] Error fetching resumes for notification:", resErr);
      return;
    }

    // Filter for unnotified resumes
    const unnotifiedResumes = resumes.filter(
      (r: any) => !r.parsed_json || !r.parsed_json.notified
    );

    if (unnotifiedResumes.length === 0) {
      console.log(`[Mail] All parsed resumes for job ${jobId} have already been notified.`);
      return;
    }

    console.log(`[Mail] Found ${unnotifiedResumes.length} unnotified resumes for job ${jobId}. Gathering context...`);

    // 3. Fetch job title and owner details
    const [jobRes, profileRes] = await Promise.all([
      supabaseAdmin.from("jobs").select("title").eq("id", jobId).single(),
      supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
    ]);

    if (jobRes.error || !jobRes.data) {
      console.error("[Mail] Error fetching job details for email:", jobRes.error);
      return;
    }

    const jobTitle = jobRes.data.title;
    let toEmail = profileRes.data?.email;
    let fullName = profileRes.data?.full_name || null;

    if (!toEmail) {
      // Fallback: query auth users using service role client if possible
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        toEmail = authUser?.user?.email;
      } catch (e) {
        console.error("[Mail] Failed to get user from auth.admin:", e);
      }
    }

    if (!toEmail) {
      console.error(`[Mail] Could not find recipient email for userId: ${userId}`);
      return;
    }

    // Format resumes for email sending
    const notificationResumes: NotificationResume[] = unnotifiedResumes.map((r: any) => ({
      fileName: r.original_filename,
      status: r.status,
      score: r.score,
      candidateName: r.parsed_json?.full_name || null,
      error: r.parsed_json?.error || null,
    }));

    // 4. Send the notification email
    const sendRes = await sendResumeStatusNotification({
      toEmail,
      fullName,
      jobTitle,
      jobId,
      resumes: notificationResumes,
    });

    // 5. Update notified = true in parsed_json for all these resumes if successfully sent or credentials missing (to avoid looping attempts)
    if (sendRes && (sendRes.success || sendRes.reason === "credentials_missing")) {
      console.log(`[Mail] Updating notified flag to true for ${unnotifiedResumes.length} resumes in job ${jobId}`);
      for (const resume of unnotifiedResumes) {
        const updatedParsed = {
          ...(resume.parsed_json || {}),
          notified: true,
        };

        const { error: finalUpdErr } = await supabaseAdmin
          .from("resumes")
          .update({ parsed_json: updatedParsed })
          .eq("id", resume.id);

        if (finalUpdErr) {
          console.error(`[Mail] Error updating resume ${resume.id} notified flag:`, finalUpdErr);
        }
      }
    }
  } catch (err) {
    console.error("[Mail] checkAndSendJobNotification execution failed:", err);
  }
}

