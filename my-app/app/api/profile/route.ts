import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count jobs owned by this user
  const { count: jobCount, error: jobErr } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", auth.user.id);

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  // Count total resumes uploaded for jobs owned by this user
  const { data: userJobs, error: userJobsErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("owner_id", auth.user.id);

  if (userJobsErr) {
    return NextResponse.json({ error: userJobsErr.message }, { status: 500 });
  }

  const jobIds = (userJobs ?? []).map((j) => j.id);

  let resumeCount = 0;
  if (jobIds.length > 0) {
    const { count: resCount, error: resErr } = await supabase
      .from("resumes")
      .select("*", { count: "exact", head: true })
      .in("job_id", jobIds);

    if (resErr) {
      return NextResponse.json({ error: resErr.message }, { status: 500 });
    }
    resumeCount = resCount ?? 0;
  }

  // Fetch all resumes owned by the user to calculate candidate directory stats
  const { data: allResumes, error: resumesErr } = await supabase
    .from("resumes")
    .select("id, email, job_id, storage_path, original_filename")
    .eq("owner_id", auth.user.id);

  if (resumesErr) {
    return NextResponse.json({ error: resumesErr.message }, { status: 500 });
  }

  const totalResumes = allResumes?.length ?? 0;
  const directoryOnlyCount = allResumes?.filter((r) => !r.job_id).length ?? 0;

  // Deduplicate by email, storage_path, or original_filename in memory to find unique candidates
  const seenEmails = new Set<string>();
  const seenStoragePaths = new Set<string>();
  const seenFilenames = new Set<string>();
  let uniqueCandidatesCount = 0;

  for (const resume of (allResumes || [])) {
    const email = resume.email?.trim().toLowerCase();
    const storagePath = resume.storage_path;
    const filename = resume.original_filename;

    if (email) {
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        if (storagePath) seenStoragePaths.add(storagePath);
        uniqueCandidatesCount++;
      }
    } else if (storagePath) {
      if (!seenStoragePaths.has(storagePath)) {
        seenStoragePaths.add(storagePath);
        uniqueCandidatesCount++;
      }
    } else if (filename) {
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        uniqueCandidatesCount++;
      }
    } else {
      uniqueCandidatesCount++;
    }
  }

  // Fetch user profile from database
  let dbPlan = "free";
  let dbUsageLimit = 50;

  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("plan, usage_limit, full_name, phone, avatar_url")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileErr) {
    // If the profiles table does not exist (PGRST205) or some database issue,
    // we fallback to free tier rather than crashing the page load.
    if (profileErr.code !== "PGRST205") {
      console.error("Profiles table error:", profileErr);
    }
  } else if (profileRow) {
    dbPlan = profileRow.plan;
    dbUsageLimit = profileRow.usage_limit;
  } else {
    // Table exists, but no row for this user. Let's insert a default row.
    const { error: insErr } = await supabase
      .from("profiles")
      .insert({ id: auth.user.id, plan: "free", usage_limit: 50 });
    
    if (insErr) {
      console.error("Failed to insert default profile:", insErr);
    }
  }

  return NextResponse.json({
    email: auth.user.email,
    campaignCount: jobCount ?? 0,
    resumeCount,
    totalResumes,
    directoryOnlyCount,
    uniqueCandidatesCount,
    plan: dbPlan,
    usageLimit: dbUsageLimit,
    fullName: profileRow?.full_name || null,
    phone: profileRow?.phone || null,
    avatarUrl: profileRow?.avatar_url || null,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { plan, fullName, phone, avatarUrl } = await req.json();

    if (plan !== undefined && plan !== "free" && plan !== "pro") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (plan !== undefined) {
      updates.plan = plan;
      updates.usage_limit = plan === "pro" ? 5000 : 50;
    }
    if (fullName !== undefined) updates.full_name = fullName;
    if (phone !== undefined) updates.phone = phone;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

    // Check if profile exists first
    const { data: existing, error: existErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (existErr) {
      if (existErr.code === "PGRST205") {
        return NextResponse.json(
          { error: "Profiles table does not exist in Supabase yet. Please run the SQL migration in `supabase/migrations/20240523000003_create_profiles.sql` in your Supabase dashboard SQL editor." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: existErr.message }, { status: 500 });
    }

    let error;
    if (existing) {
      // Update existing profile
      const { error: updErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", auth.user.id);
      error = updErr;
    } else {
      // Insert profile
      const { error: insErr } = await supabase
        .from("profiles")
        .insert({
          id: auth.user.id,
          plan: updates.plan || "free",
          usage_limit: updates.usage_limit || 50,
          full_name: updates.full_name || null,
          phone: updates.phone || null,
          avatar_url: updates.avatar_url || null,
        });
      error = insErr;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      plan: updates.plan,
      usageLimit: updates.usage_limit,
      fullName: updates.full_name,
      phone: updates.phone,
      avatarUrl: updates.avatar_url,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
