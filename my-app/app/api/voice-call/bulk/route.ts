import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getVapiClient, buildScreeningPrompt } from "@/lib/vapi";

export const runtime = "nodejs";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST: Initiate bulk voice calls to multiple candidates
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { resumeIds, jobId, questions } = body as {
    resumeIds: string[];
    jobId?: string;
    questions: string[];
  };

  if (!resumeIds?.length || !questions?.length) {
    return NextResponse.json(
      { error: "resumeIds and questions are required" },
      { status: 400 }
    );
  }

  if (resumeIds.length > 20) {
    return NextResponse.json(
      { error: "Maximum 20 candidates per bulk call" },
      { status: 400 }
    );
  }

  // Fetch all candidates
  const { data: resumes, error: fetchErr } = await supabase
    .from("resumes")
    .select("id, full_name, phone, parsed_json, job_id")
    .in("id", resumeIds);

  if (fetchErr || !resumes?.length) {
    return NextResponse.json({ error: "No candidates found" }, { status: 404 });
  }

  // Fetch job info for context in calls
  let jobContext: { title?: string; company?: string; description?: string; location?: string } | undefined;
  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, company, location, description")
      .eq("id", jobId)
      .single();
    if (job) {
      let desc = job.description || "";
      const kwIdx = desc.indexOf("---KEYWORDS---");
      if (kwIdx > 0) desc = desc.slice(0, kwIdx).trim();
      if (desc.length > 800) desc = desc.slice(0, 800) + "...";
      jobContext = {
        title: job.title || undefined,
        company: job.company || undefined,
        description: desc || undefined,
        location: job.location || undefined,
      };
    }
  }

  const serviceSupabase = getServiceSupabase();
  const vapi = getVapiClient();
  const results: { resumeId: string; name: string; status: string; error?: string; callId?: string }[] = [];

  // Process calls sequentially to avoid rate limits
  for (const resume of resumes) {
    const phone = resume.phone || resume.parsed_json?.phone;
    if (!phone) {
      results.push({ resumeId: resume.id, name: resume.full_name || "Unknown", status: "skipped", error: "No phone number" });
      continue;
    }

    const candidateName = resume.full_name || "there";
    let formattedPhone = phone.replace(/[\s\-\(\)\.]/g, "");
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+1" + formattedPhone;
    }

    try {
      const call = await vapi.calls.create({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
        customer: { number: formattedPhone, name: candidateName },
        assistant: {
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: buildScreeningPrompt(candidateName, questions, jobContext) }],
          },
          voice: { provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM" },
          firstMessage: `Hi ${candidateName}, this is an AI assistant calling on behalf of the recruiting team. We'd like to ask you a few quick questions about your application. It should only take a couple of minutes. Is now a good time?`,
          firstMessageMode: "assistant-speaks-first",
          maxDurationSeconds: 300,
          endCallMessage: "Thank you for your time, have a great day. Goodbye!",
          endCallPhrases: ["goodbye", "have a great day", "thank you for your time"],
          analysisPlan: {
            summaryPlan: { enabled: true, timeoutSeconds: 10 },
            structuredDataPlan: {
              enabled: true,
              schema: { type: "object", description: "Candidate screening answers" },
              timeoutSeconds: 10,
            },
            successEvaluationPlan: { enabled: true, rubric: "PassFail", timeoutSeconds: 10 },
          },
          server: { url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice-call/webhook` },
        },
        name: `Bulk Screening: ${candidateName}`,
      });

      const vapiCallId = typeof call === "object" && "id" in call ? (call as any).id : null;

      if (vapiCallId) {
        await serviceSupabase.from("voice_calls").insert({
          owner_id: auth.user.id,
          resume_id: resume.id,
          job_id: jobId || resume.job_id || null,
          vapi_call_id: vapiCallId,
          candidate_name: candidateName,
          candidate_phone: formattedPhone,
          status: "queued",
          questions,
        });
        results.push({ resumeId: resume.id, name: candidateName, status: "queued", callId: vapiCallId });
      } else {
        results.push({ resumeId: resume.id, name: candidateName, status: "failed", error: "No call ID returned" });
      }
    } catch (err: any) {
      results.push({ resumeId: resume.id, name: candidateName, status: "failed", error: err.message });
    }

    // Small delay between calls to avoid rate limits
    if (resumes.indexOf(resume) < resumes.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return NextResponse.json({
    data: {
      total: resumeIds.length,
      queued: results.filter((r) => r.status === "queued").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    },
  });
}
