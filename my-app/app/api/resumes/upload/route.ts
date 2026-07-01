import { NextResponse, after } from "next/server";
import JSZip from "jszip";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scoreResume } from "@/lib/parse";
import { parseResumeWithOpenAI, extractKeywordsFromJobDescription, calculateMatchScore } from "@/lib/openai";
import { parseCampaignDescription, encodeCampaignDescription } from "@/lib/campaign";
import { extractText } from "@/lib/extract";
import { lookup } from "mime-types";

export const runtime = "nodejs";

function safeName(s: string) {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 120);
}
function cleanText(s: string) {
  return (s ?? "")
    .replace(/\u0000/g, "") // remove NULL chars (biggest cause)
    .replace(/[\uD800-\uDFFF]/g, ""); // remove lone surrogates (rare, but safe)
}

function cleanJson(value: any): any {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanJson);
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanJson(v);
    return out;
  }
  return value;
}



const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleOneUpload(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  jobId: string | null,
  fileName: string,
  mimeType: string | undefined,
  bytes: Buffer,
) {
  // 1) insert row (status: processing)
  const { data: row, error: insErr } = await supabase
    .from("resumes")
    .insert({
      owner_id: userId,
      job_id: jobId || null,
      source: "upload",
      original_filename: fileName,
      mime_type: mimeType ?? null,
      file_size_bytes: bytes.length,
      status: "uploaded", // valid enum value, triggers UI polling
    })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);
  const id = row.id as string;

  // 2) upload to Storage
  const bucket = "resumes";
  const path = jobId
    ? `${userId}/${jobId}/${id}/${safeName(fileName)}`
    : `${userId}/candidates/${id}/${safeName(fileName)}`;

  // Auto-detect mime-type if missing
  const contentType =
    mimeType || lookup(fileName) || "application/octet-stream";

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });

  if (upErr) throw new Error(upErr.message);

  return { ok: true, id, fileName, path, bucket };
}

// Background processing function (runs after the HTTP response is sent)
export async function processResumeBackground(
  userId: string,
  jobId: string | null,
  id: string,
  fileName: string,
  mimeType: string | undefined,
  bytes: Buffer,
  bucket: string,
  path: string,
) {
  // We need a fresh Supabase client because the server client from the request
  // might lose its cookies context after the response is sent.
  // Using the admin role key to bypass RLS in the background.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
    return;
  }

  const supabaseAdmin = (await import("@supabase/supabase-js")).createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // 1) Fetch job keywords and AI screening toggle if jobId is present
    let jobKeywords: string[] = [];
    let aiScreening = false;
    let jobDescOnly = "";
    let jobTitle = "";

    if (jobId) {
      const { data: jobData } = await supabaseAdmin
        .from("jobs")
        .select("title, description")
        .eq("id", jobId)
        .single();

      if (jobData && jobData.description) {
        jobTitle = jobData.title || "";
        const parsed = parseCampaignDescription(jobData.description);
        jobKeywords = parsed.keywords;
        aiScreening = parsed.aiScreening;
        jobDescOnly = parsed.descriptionText;

        if (jobKeywords.length === 0) {
          // Dynamic keyword extraction if missing (self-heal)
          jobKeywords = await extractKeywordsFromJobDescription(`Title: ${jobTitle}\nDescription: ${jobDescOnly || jobData.description}`);
          const enrichedDesc = encodeCampaignDescription(jobDescOnly || jobData.description, jobKeywords, aiScreening);
          await supabaseAdmin
            .from("jobs")
            .update({ description: enrichedDesc })
            .eq("id", jobId);
        }
      }
    }

    // 2) Parse candidate resume with OpenAI (WITH or WITHOUT job context evaluation)
    const raw = await extractText(fileName, mimeType, bytes);
    const extracted_text = cleanText(raw);

    let openaiResult;
    if (jobId && aiScreening) {
      const jobContext = `Title: ${jobTitle}\nRequirements / Description:\n${jobDescOnly}`;
      openaiResult = await parseResumeWithOpenAI(extracted_text, jobContext);
    } else {
      openaiResult = await parseResumeWithOpenAI(extracted_text, "Not provided");
    }

    if (!openaiResult.success) {
      // Store the structured error for the frontend
      await supabaseAdmin
        .from("resumes")
        .update({
          storage_bucket: bucket,
          storage_path: path,
          extracted_text,
          status: "error",
          parsed_json: {
            error: openaiResult.message,
            error_code: openaiResult.code,
            retryable: openaiResult.retryable,
          },
        })
        .eq("id", id);
      return;
    }

    const openaiData = openaiResult.data;

    // 3) Compute score programmatically or extract AI score if jobId exists
    let finalScore = null;
    let finalBreakdown = {};

    if (jobId) {
      if (aiScreening) {
        finalScore = openaiData.scoring?.score ?? null;
        finalBreakdown = openaiData.scoring?.breakdown ?? {};
      } else {
        const candidateKeywords = [
          ...(openaiData.keywords || openaiData.skills || [])
        ].map((k: any) => String(k).toLowerCase().trim());

        const { score, matched, missing } = calculateMatchScore(
          jobKeywords,
          candidateKeywords,
          openaiData.years_experience
        );
        
        finalScore = score;
        finalBreakdown = {
          relevance: `Matched ${matched.length} out of ${jobKeywords.length} job keywords.`,
          strengths: matched,
          weaknesses: missing,
        };
      }
    }

    const updatedParsed = {
      ...(openaiData || {}),
      scoring: jobId
        ? {
            score: finalScore,
            breakdown: finalBreakdown,
          }
        : undefined,
    };

    const { error: updErr } = await supabaseAdmin
      .from("resumes")
      .update({
        storage_bucket: bucket,
        storage_path: path,
        extracted_text,
        full_name: openaiData.full_name,
        email: openaiData.email,
        phone: openaiData.phone,
        status: "scored",
        score: finalScore,
        score_breakdown: finalBreakdown,
        scoring_version: aiScreening ? "ai-1.0" : "keyword-1.0",
        parsed_json: updatedParsed,
      })
      .eq("id", id);

    if (updErr) throw new Error(updErr.message);
  } catch (err: any) {
    console.error("Background parsing failed for", fileName, err);
    await supabaseAdmin
      .from("resumes")
      .update({
        storage_bucket: bucket,
        storage_path: path,
        status: "error",
        parsed_json: {
          error: err?.message ?? String(err),
          error_code: "UNKNOWN",
          retryable: true,
        },
      })
      .eq("id", id);
  } finally {
    if (jobId) {
      try {
        const { checkAndSendSearchNotification } = await import("@/lib/mail");
        await checkAndSendSearchNotification(supabaseAdmin, userId, jobId);
      } catch (mailErr) {
        console.error("Failed to trigger search criteria completion email notification:", mailErr);
      }
    }
  }
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    const jobIdRaw = form.get("id") || form.get("jobId");
    const jobId = typeof jobIdRaw === "string" && jobIdRaw.trim() ? jobIdRaw.trim() : null;

    const staggerIndexRaw = form.get("staggerIndex");
    const staggerIndex = staggerIndexRaw ? parseInt(String(staggerIndexRaw), 10) : 0;

    if (!file)
      return NextResponse.json({ error: "Missing file" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const name = file.name;
    const mime = file.type || undefined;

    // ZIP upload: don't let one bad file break everything
    if (name.toLowerCase().endsWith(".zip") || mime === "application/zip") {
      const zip = await JSZip.loadAsync(bytes);
      const entries = Object.values(zip.files).filter((f) => !f.dir);

      const uploaded: any[] = [];
      const failed: any[] = [];

      for (const entry of entries) {
        const entryName = entry.name.split("/").pop() || entry.name;

        // only support these for now
        if (!/\.(pdf|docx|txt)$/i.test(entryName)) {
          failed.push({
            fileName: entryName,
            error: "Unsupported file type (only pdf/docx/txt allowed)",
          });
          continue;
        }

        try {
          const entryBytes = Buffer.from(await entry.async("arraybuffer"));
          const res = await handleOneUpload(
            supabase,
            auth.user.id,
            jobId,
            entryName,
            undefined,
            entryBytes,
          );

          if (res.ok) {
            uploaded.push(res);

            // Fire and forget parsing immediately post-response using after()
            after(() => {
              processResumeBackground(
                auth.user.id,
                jobId,
                res.id,
                entryName,
                undefined,
                entryBytes,
                res.bucket,
                res.path,
              ).catch(console.error);
            });
          }
        } catch (e: any) {
          failed.push({ fileName: entryName, error: e?.message ?? "Failed" });
        }
      }

      return NextResponse.json({ uploaded, failed });
    }

    // Single file upload
    const result = await handleOneUpload(
      supabase,
      auth.user.id,
      jobId,
      name,
      mime,
      bytes,
    );

    if (result.ok) {
      // Fire and forget parsing immediately using after() to keep runtime alive on Vercel
      after(() => {
        processResumeBackground(
          auth.user.id,
          jobId,
          result.id,
          name,
          mime,
          bytes,
          result.bucket,
          result.path,
        ).catch(console.error);
      });
    }

    return NextResponse.json({ data: result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Upload failed" },
      { status: 500 },
    );
  }
}
