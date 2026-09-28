import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST: Send SMS to a candidate
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { resumeId, message } = body as { resumeId: string; message: string };

  if (!resumeId || !message?.trim()) {
    return NextResponse.json({ error: "resumeId and message are required" }, { status: 400 });
  }

  // Fetch candidate phone
  const { data: resume } = await supabase
    .from("resumes")
    .select("id, phone, parsed_json, full_name")
    .eq("id", resumeId)
    .single();

  if (!resume) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const phone = resume.phone || resume.parsed_json?.phone;
  if (!phone) {
    return NextResponse.json({ error: "Candidate has no phone number" }, { status: 400 });
  }

  let formattedPhone = phone.replace(/[\s\-\(\)\.]/g, "");
  if (!formattedPhone.startsWith("+")) {
    formattedPhone = "+1" + formattedPhone;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json(
      { error: "Twilio SMS not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to env." },
      { status: 500 }
    );
  }

  try {
    // Send SMS via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const smsRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formattedPhone,
        From: fromNumber,
        Body: message,
      }),
    });

    const smsData = await smsRes.json();

    if (!smsRes.ok) {
      return NextResponse.json(
        { error: smsData.message || "Failed to send SMS" },
        { status: 500 }
      );
    }

    // Log the SMS
    const serviceSupabase = getServiceSupabase();
    await serviceSupabase.from("sms_logs").insert({
      owner_id: auth.user.id,
      resume_id: resumeId,
      to_phone: formattedPhone,
      message,
      status: "sent",
      twilio_sid: smsData.sid || null,
    });

    return NextResponse.json({ data: { status: "sent", sid: smsData.sid } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to send SMS" }, { status: 500 });
  }
}

// GET: List SMS logs for a candidate
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resumeId = searchParams.get("resumeId");

  let query = supabase
    .from("sms_logs")
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
