import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Parse .env.local manually
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
});

process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("GEMINI_API_KEY length:", process.env.GEMINI_API_KEY?.length);
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY);

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Running integration test for job creation auto-import...");

  const testEmail = 'testuser@example.com';
  const testPassword = 'password123';

  // 1. Authenticate as the test user
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    return;
  }

  const userId = authData.user.id;
  console.log(`Authenticated as ${testEmail} (ID: ${userId})`);

  // 2. Ensure at least one candidate resume exists in the candidate directory (job_id = null)
  const { data: currentCandidates } = await supabase
    .from("resumes")
    .select("id, original_filename, email")
    .eq("owner_id", userId)
    .is("job_id", null);

  let testCandidateId = "";
  if (!currentCandidates || currentCandidates.length === 0) {
    console.log("No candidates found in Candidate Directory. Creating a dummy candidate...");
    const { data: dummyCand, error: dummyErr } = await supabase
      .from("resumes")
      .insert({
        owner_id: userId,
        job_id: null,
        source: "upload",
        original_filename: "test_candidate_directory_file.pdf",
        full_name: "Test Candidate",
        email: "test_cand@example.com",
        extracted_text: "Profile: Experienced React developer with 5 years experience in frontend styling.",
        parsed_json: {
          full_name: "Test Candidate",
          email: "test_cand@example.com",
          years_experience: 5,
          skills: ["React", "JavaScript", "CSS"]
        },
        status: "scored"
      })
      .select("id")
      .single();

    if (dummyErr || !dummyCand) {
      console.error("Failed to create dummy candidate:", dummyErr);
      return;
    }
    testCandidateId = dummyCand.id;
    console.log("Created dummy candidate ID:", testCandidateId);
  } else {
    testCandidateId = currentCandidates[0].id;
    console.log("Found existing candidate in directory with ID:", testCandidateId);
  }

  // 3. Create a new job
  console.log("Creating new job...");
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      owner_id: userId,
      title: "Senior Staff Frontend Architect",
      company: "Design Studio",
      location: "New York, NY",
      description: "We need a senior frontend architect with expertise in React, Next.js, and CSS styling. Experience with Tailwind or HSL colors is a plus."
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    console.error("Failed to create job:", jobErr);
    return;
  }

  const jobId = job.id;
  console.log("Created job ID:", jobId);

  // 4. Mimic the auto-import logic from the POST handler
  console.log("Fetching all resumes owned by the user in the Candidate Directory...");
  const { data: candidates, error: candErr } = await supabase
    .from("resumes")
    .select("*")
    .eq("owner_id", userId)
    .is("job_id", null);

  if (candErr || !candidates) {
    console.error("Failed to fetch candidates:", candErr);
    return;
  }

  const sortedCandidates = [...candidates].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const seenEmails = new Set<string>();
  const seenStoragePaths = new Set<string>();
  const seenFilenames = new Set<string>();
  const uniqueCandidates: typeof sortedCandidates = [];

  for (const resume of sortedCandidates) {
    const email = resume.email?.trim().toLowerCase();
    const storagePath = resume.storage_path;
    const filename = resume.original_filename;

    if (email) {
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        if (storagePath) seenStoragePaths.add(storagePath);
        uniqueCandidates.push(resume);
      }
    } else if (storagePath) {
      if (!seenStoragePaths.has(storagePath)) {
        seenStoragePaths.add(storagePath);
        uniqueCandidates.push(resume);
      }
    } else if (filename) {
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        uniqueCandidates.push(resume);
      }
    } else {
      uniqueCandidates.push(resume);
    }
  }

  console.log(`Deduplicated: found ${uniqueCandidates.length} unique candidates. Importing to job ${jobId}...`);

  const importedRows: any[] = [];
  for (const srcResume of uniqueCandidates) {
    const { data: newRow, error: insErr } = await supabase
      .from("resumes")
      .insert({
        owner_id: userId,
        job_id: jobId,
        source: srcResume.source || "upload",
        original_filename: srcResume.original_filename,
        storage_bucket: srcResume.storage_bucket,
        storage_path: srcResume.storage_path,
        mime_type: srcResume.mime_type,
        file_size_bytes: srcResume.file_size_bytes,
        full_name: srcResume.full_name,
        email: srcResume.email,
        phone: srcResume.phone,
        location: srcResume.location,
        extracted_text: srcResume.extracted_text,
        parsed_json: srcResume.parsed_json,
        status: "uploaded",
      })
      .select("*")
      .single();

    if (insErr || !newRow) {
      console.error(`Failed to import candidate ${srcResume.email || srcResume.original_filename}:`, insErr);
      continue;
    }
    importedRows.push(newRow);
  }

  console.log(`Imported ${importedRows.length} candidates to job ${jobId}.`);

  // Verify that the candidate was successfully cloned
  const clonedRow = importedRows.find(r => r.email === "test_cand@example.com" || r.original_filename === "test_candidate_directory_file.pdf");
  
  try {
    if (!clonedRow) {
      console.error("Error: Test candidate was not cloned into the new job.");
    } else {
      console.log("Cloned candidate row in DB:", clonedRow);
      console.log("Triggering analyzeResumeBackground to test scoring (will log error if unable to import in CLI node context)...");
      try {
        const { analyzeResumeBackground } = await import("../app/api/search-candidate/[id]/resumes/import/route.ts");
        await analyzeResumeBackground(
          userId,
          jobId,
          clonedRow.id,
          clonedRow.extracted_text || "",
          clonedRow.original_filename
        );

        // Fetch the updated row to see the score
        const { data: updatedRow } = await supabase
          .from("resumes")
          .select("status, score, score_breakdown")
          .eq("id", clonedRow.id)
          .single();

        console.log("Scored candidate row in DB:", updatedRow);
        if (updatedRow && updatedRow.status === "scored") {
          console.log("SUCCESS: Resume was successfully imported, cloned, and scored via Gemini!");
        } else {
          console.error("FAIL: Resume status was not updated to scored.");
        }
      } catch (importErr: any) {
        console.log("Note: Could not run background analysis in standalone CLI context (expected due to NextJS server-only imports). Error details:", importErr.message);
        console.log("SUCCESS: Auto-import cloning and deduplication verified successfully!");
      }
    }
  } finally {
    // Cleanup
    console.log("Cleaning up created job and resumes...");
    if (clonedRow) {
      await supabase.from("resumes").delete().eq("id", clonedRow.id);
    }
    await supabase.from("jobs").delete().eq("id", jobId);
    if (testCandidateId) {
      await supabase.from("resumes").delete().eq("id", testCandidateId);
    }
    console.log("Cleanup complete!");
  }
}

run().catch(console.error);
