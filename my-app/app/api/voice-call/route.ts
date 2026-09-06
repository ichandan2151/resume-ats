import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVapiClient, buildScreeningPrompt } from "@/lib/vapi";

export const runtime = "nodejs";

// POST: Initiate a voice call to a candidate
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { resumeId, jobId, questions } = body as {
    resumeId: string;
    jobId?: string;
    questions: string[];
  };

  if (!resumeId || !questions?.length) {
    return NextResponse.json(
      { error: "resumeId and questions are required" },
      { status: 400 }
    );
  }

  // Fetch candidate details
  const { data: resume, error: resumeErr } = await supabase
    .from("resumes")
    .select("id, full_name, phone, parsed_json, job_id")
    .eq("id", resumeId)
    .single();

  if (resumeErr || !resume) {
    return NextResponse.json(
      { error: "Candidate not found" },
      { status: 404 }
    );
  }

  const phone = resume.phone || resume.parsed_json?.phone;
  if (!phone) {
    return NextResponse.json(
      { error: "Candidate has no phone number" },
      { status: 400 }
    );
  }

  const candidateName = resume.full_name || "there";

  // Format phone to E.164 if needed
  let formattedPhone = phone.replace(/[\s\-\(\)\.]/g, "");
  if (!formattedPhone.startsWith("+")) {
    formattedPhone = "+1" + formattedPhone; // Default to US
  }

  const vapi = getVapiClient();

  try {
    const call = await vapi.calls.create({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID!,
      customer: {
        number: formattedPhone,
        name: candidateName,
      },
      assistant: {
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: buildScreeningPrompt(candidateName, questions),
            },
          ],
        },
        voice: {
          provider: "11labs",
          voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - natural female voice
        },
        firstMessage: `Hi ${candidateName}, this is an AI assistant calling on behalf of the recruiting team. We'd like to ask you a few quick questions about your application. It should only take a couple of minutes. Is now a good time?`,
        firstMessageMode: "assistant-speaks-first",
        maxDurationSeconds: 300, // 5 min max
        endCallMessage: "Thank you for your time, have a great day. Goodbye!",
        endCallPhrases: ["goodbye", "have a great day", "thank you for your time"],
        analysisPlan: {
          summaryPlan: {
            enabled: true,
            timeoutSeconds: 10,
          },
          structuredDataPlan: {
            enabled: true,
            schema: {
              type: "object",
              description: "Candidate screening answers extracted from the call",
            },
            timeoutSeconds: 10,
          },
          successEvaluationPlan: {
            enabled: true,
            rubric: "PassFail",
            timeoutSeconds: 10,
          },
        },
        server: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice-call/webhook`,
        },
      },
      name: `Screening: ${candidateName}`,
    });

    const vapiCallId =
      typeof call === "object" && "id" in call ? (call as any).id : null;

    if (!vapiCallId) {
      return NextResponse.json(
        { error: "Failed to get call ID from Vapi" },
        { status: 500 }
      );
    }

    // Store in database
    const { data: voiceCall, error: insertErr } = await supabase
      .from("voice_calls")
      .insert({
        owner_id: auth.user.id,
        resume_id: resumeId,
        job_id: jobId || resume.job_id || null,
        vapi_call_id: vapiCallId,
        candidate_name: candidateName,
        candidate_phone: formattedPhone,
        status: "queued",
        questions,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Failed to store voice call:", insertErr);
      return NextResponse.json(
        { error: "Call initiated but failed to store record" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: voiceCall });
  } catch (err: any) {
    console.error("Vapi call creation failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to initiate call" },
      { status: 500 }
    );
  }
}

// GET: List voice calls for current user (optionally filtered by resumeId)
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resumeId = searchParams.get("resumeId");

  let query = supabase
    .from("voice_calls")
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
