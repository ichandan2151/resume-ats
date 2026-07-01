import { NextResponse, after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractKeywordsFromJobDescription, calculateMatchScore } from "@/lib/openai";
import { parseCampaignDescription, encodeCampaignDescription } from "@/lib/campaign";
import { retryInBackground } from "@/app/api/resumes/[id]/retry/route";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, title, company, location, description, created_at")
    .eq("id", id)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || "Job campaign not found" }, { status: 404 });
  }

  let enrichedDescription = job.description;
  let jobKeywords: string[] = [];
  let aiScreening = false;

  if (job.description) {
    const parsed = parseCampaignDescription(job.description);
    jobKeywords = parsed.keywords;
    aiScreening = parsed.aiScreening;
    enrichedDescription = parsed.descriptionText;

    // Self-heal if delimiter is missing or keywords array is empty
    if (jobKeywords.length === 0) {
      try {
        const cleanDesc = enrichedDescription || job.description;
        const contextText = `Title: ${job.title || ""}\nDescription: ${cleanDesc}`;
        const keywords = await extractKeywordsFromJobDescription(contextText);
        
        enrichedDescription = encodeCampaignDescription(cleanDesc, keywords, aiScreening);
        jobKeywords = keywords;
        
        await supabase
          .from("jobs")
          .update({ description: enrichedDescription })
          .eq("id", id);

        // Re-score all candidates linked to this campaign using the new keywords
        if (keywords.length > 0) {
          const { data: campaignResumes } = await supabase
            .from("resumes")
            .select("id, parsed_json, original_filename, extracted_text, storage_bucket, storage_path")
            .eq("job_id", id);
            
          if (campaignResumes && campaignResumes.length > 0) {
            if (aiScreening) {
              // Mark candidates as processing and score in background
              await supabase
                .from("resumes")
                .update({
                  status: "uploaded",
                  score: null,
                  score_breakdown: {},
                  scoring_version: "ai-1.0",
                })
                .eq("job_id", id);

              after(() => {
                for (const resume of campaignResumes) {
                  retryInBackground(
                    auth.user.id,
                    id,
                    resume.id,
                    resume.extracted_text,
                    resume.storage_bucket || "resumes",
                    resume.storage_path || ""
                  ).catch(console.error);
                }
              });
            } else {
              for (const resume of campaignResumes) {
                const candidateKeywords = [
                  ...(resume.parsed_json?.keywords || resume.parsed_json?.skills || [])
                ].map((k: any) => String(k).toLowerCase().trim());

                const { score, matched, missing } = calculateMatchScore(
                  keywords,
                  candidateKeywords,
                  resume.parsed_json?.years_experience
                );
                
                const score_breakdown = {
                  relevance: `Matched ${matched.length} out of ${keywords.length} job keywords.`,
                  strengths: matched,
                  weaknesses: missing,
                };
                
                const updatedParsed = {
                  ...(resume.parsed_json || {}),
                  scoring: {
                    score,
                    breakdown: score_breakdown,
                  }
                };
                
                await supabase
                  .from("resumes")
                  .update({
                    score,
                    score_breakdown,
                    scoring_version: "keyword-1.0",
                    status: "scored",
                    parsed_json: updatedParsed
                  })
                  .eq("id", resume.id);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to self-heal campaign keywords:", err);
      }
    }
  }

  return NextResponse.json({
    data: {
      ...job,
      description: enrichedDescription,
      keywords: jobKeywords,
      ai_screening: aiScreening,
    }
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch all resumes linked to this search campaign
  const { data: jobResumes, error: fetchErr } = await supabase
    .from("resumes")
    .select("id, email, storage_path, original_filename")
    .eq("job_id", id);

  if (fetchErr) {
    return NextResponse.json(
      { error: "Failed to fetch campaign resumes: " + fetchErr.message },
      { status: 500 },
    );
  }

  // 2. Fetch all resumes in the Candidate Directory (job_id is null) for the user
  const { data: dirResumes, error: dirErr } = await supabase
    .from("resumes")
    .select("id, email, storage_path, original_filename")
    .eq("owner_id", auth.user.id)
    .is("job_id", null);

  if (dirErr) {
    return NextResponse.json(
      { error: "Failed to fetch Candidate Directory: " + dirErr.message },
      { status: 500 },
    );
  }

  // 3. Match and separate duplicates to delete vs unique ones to preserve as directory candidates
  const dirEmails = new Set<string>();
  const dirStoragePaths = new Set<string>();
  const dirFilenames = new Set<string>();

  for (const r of dirResumes || []) {
    if (r.email) dirEmails.add(r.email.trim().toLowerCase());
    if (r.storage_path) dirStoragePaths.add(r.storage_path);
    if (r.original_filename) dirFilenames.add(r.original_filename);
  }

  const idsToDelete: string[] = [];
  const idsToPreserve: string[] = [];

  for (const r of jobResumes || []) {
    const email = r.email?.trim().toLowerCase();
    const storagePath = r.storage_path;
    const filename = r.original_filename;

    let existsInDir = false;
    if (email && dirEmails.has(email)) {
      existsInDir = true;
    } else if (storagePath && dirStoragePaths.has(storagePath)) {
      existsInDir = true;
    } else if (filename && dirFilenames.has(filename)) {
      existsInDir = true;
    }

    if (existsInDir) {
      idsToDelete.push(r.id);
    } else {
      idsToPreserve.push(r.id);
    }
  }

  // Delete duplicate ones to clean up database space
  if (idsToDelete.length > 0) {
    const { error: delResError } = await supabase
      .from("resumes")
      .delete()
      .in("id", idsToDelete);

    if (delResError) {
      return NextResponse.json(
        { error: "Failed to delete duplicate resumes: " + delResError.message },
        { status: 500 },
      );
    }
  }

  // Dissociate the unique ones (set job_id = null) so they are safely kept in Candidate Directory
  if (idsToPreserve.length > 0) {
    const { error: updResError } = await supabase
      .from("resumes")
      .update({ job_id: null })
      .in("id", idsToPreserve);

    if (updResError) {
      return NextResponse.json(
        { error: "Failed to dissociate unique resumes: " + updResError.message },
        { status: 500 },
      );
    }
  }

  // 2. Delete the search campaign row from jobs table
  const { error: delErr } = await supabase
    .from("jobs")
    .delete()
    .eq("id", id)
    .eq("owner_id", auth.user.id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const title = body?.title !== undefined ? String(body.title).trim() : undefined;
  const company = body?.company !== undefined ? String(body.company).trim() : undefined;
  const location = body?.location !== undefined ? String(body.location).trim() : undefined;
  const descriptionText = body?.description !== undefined ? String(body.description).trim() : undefined;
  const aiScreening = body?.aiScreening !== undefined ? body.aiScreening === true : undefined;

  // Fetch current job details
  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job campaign not found" }, { status: 404 });
  }

  const currentData = parseCampaignDescription(job.description);

  // Update fields if provided
  const updatedTitle = title !== undefined ? title : job.title;
  const updatedCompany = company !== undefined ? company : job.company;
  const updatedLocation = location !== undefined ? location : job.location;
  const updatedDescText = descriptionText !== undefined ? descriptionText : currentData.descriptionText;
  const updatedAiScreening = aiScreening !== undefined ? aiScreening : currentData.aiScreening;

  // Extract new keywords if descriptionText or title changed
  let updatedKeywords = currentData.keywords;
  if (descriptionText !== undefined || title !== undefined || currentData.keywords.length === 0) {
    updatedKeywords = await extractKeywordsFromJobDescription(`Title: ${updatedTitle}\nDescription: ${updatedDescText}`);
  }

  const newDescriptionEncoded = encodeCampaignDescription(updatedDescText, updatedKeywords, updatedAiScreening);

  // Update the jobs table
  const { data: updatedJob, error: updateErr } = await supabase
    .from("jobs")
    .update({
      title: updatedTitle,
      company: updatedCompany || null,
      location: updatedLocation || null,
      description: newDescriptionEncoded,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Check if we need to re-score candidates (e.g. if keywords or aiScreening toggle changed)
  const screeningModeChanged = aiScreening !== undefined && aiScreening !== currentData.aiScreening;
  const descriptionChanged = descriptionText !== undefined || title !== undefined;

  if (screeningModeChanged || descriptionChanged) {
    // Re-score all candidates
    const { data: resumes } = await supabase
      .from("resumes")
      .select("id, extracted_text, parsed_json, original_filename, storage_bucket, storage_path")
      .eq("job_id", id);

    if (resumes && resumes.length > 0) {
      if (updatedAiScreening) {
        // AI screening enabled: reset status to uploaded and run in background
        await supabase
          .from("resumes")
          .update({
            status: "uploaded",
            score: null,
            score_breakdown: {},
            scoring_version: "ai-1.0",
          })
          .eq("job_id", id);

        // Run background screening
        after(() => {
          for (const r of resumes) {
            retryInBackground(
              auth.user.id,
              id,
              r.id,
              r.extracted_text,
              r.storage_bucket || "resumes",
              r.storage_path || ""
            ).catch(console.error);
          }
        });
      } else {
        // Keyword matching: compute scores locally and update instantly
        for (const r of resumes) {
          const candidateKeywords = [
            ...(r.parsed_json?.keywords || r.parsed_json?.skills || [])
          ].map((k: any) => String(k).toLowerCase().trim());

          const { score, matched, missing } = calculateMatchScore(
            updatedKeywords,
            candidateKeywords,
            r.parsed_json?.years_experience
          );

          const score_breakdown = {
            relevance: `Matched ${matched.length} out of ${updatedKeywords.length} job keywords.`,
            strengths: matched,
            weaknesses: missing,
          };

          const updatedParsed = {
            ...(r.parsed_json || {}),
            scoring: {
              score,
              breakdown: score_breakdown,
            },
          };

          await supabase
            .from("resumes")
            .update({
              score,
              score_breakdown,
              scoring_version: "keyword-1.0",
              status: "scored",
              parsed_json: updatedParsed,
            })
            .eq("id", r.id);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ...updatedJob,
      description: updatedDescText,
      keywords: updatedKeywords,
      ai_screening: updatedAiScreening,
    }
  });
}
