import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleOneUpload, processResumeBackground } from "@/app/api/resumes/upload/route";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { fileId, accessToken, fileName, mimeType, jobId: jobIdRaw, staggerIndex } = body;
    const jobId = typeof jobIdRaw === "string" && jobIdRaw.trim() ? jobIdRaw.trim() : null;

    if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
    if (!accessToken) return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
    if (!fileName) return NextResponse.json({ error: "Missing fileName" }, { status: 400 });

    // 1. Fetch the file bytes from Google Drive API using user's access token
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!driveRes.ok) {
      const errMsg = await driveRes.text();
      console.error("Failed to download file from Google Drive:", errMsg);
      return NextResponse.json(
        { error: `Failed to download file from Google Drive: ${driveRes.statusText}` },
        { status: driveRes.status }
      );
    }

    const arrayBuffer = await driveRes.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    // 2. Reuse the upload helper to insert database row & upload to Supabase Storage
    const result = await handleOneUpload(
      supabase,
      auth.user.id,
      jobId,
      fileName,
      mimeType,
      bytes
    );

    if (result.ok) {
      // 3. Fire and forget parsing, with staggering delay if index provided
      const delayMs = (typeof staggerIndex === "number" ? staggerIndex : 0) * 10000;
      if (delayMs > 0) {
        setTimeout(() => {
          processResumeBackground(
            auth.user.id,
            jobId,
            result.id,
            fileName,
            mimeType,
            bytes,
            result.bucket,
            result.path
          ).catch((err) => {
            console.error("Google Drive background parsing error:", err);
          });
        }, delayMs);
      } else {
        processResumeBackground(
          auth.user.id,
          jobId,
          result.id,
          fileName,
          mimeType,
          bytes,
          result.bucket,
          result.path
        ).catch((err) => {
          console.error("Google Drive background parsing error:", err);
        });
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error("Google Drive upload endpoint error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Google Drive import failed" },
      { status: 500 }
    );
  }
}
