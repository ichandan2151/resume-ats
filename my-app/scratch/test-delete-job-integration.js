const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Parse .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
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

// Using admin client to set up the test, then login as test user to run operations
const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Starting DB-level integration test...");

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

  // 2. Create a test job
  console.log("Creating test job...");
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      owner_id: userId,
      title: "Test Temp Job",
      company: "Test Company",
      description: "Temp description"
    })
    .select("id")
    .single();

  if (jobErr) {
    console.error("Failed to create job:", jobErr);
    return;
  }

  const jobId = job.id;
  console.log("Created test job with ID:", jobId);

  // 3. Create a test resume linked to that job
  console.log("Creating test resume linked to job...");
  const { data: resume, error: resumeErr } = await supabase
    .from("resumes")
    .insert({
      owner_id: userId,
      job_id: jobId,
      original_filename: "test_temp_candidate.pdf",
      status: "uploaded",
      source: "upload"
    })
    .select("id")
    .single();

  if (resumeErr) {
    console.error("Failed to create resume:", resumeErr);
    // Cleanup job
    await supabase.from("jobs").delete().eq("id", jobId);
    return;
  }

  const resumeId = resume.id;
  console.log("Created test resume with ID:", resumeId);

  // 4. Verify linking
  const { data: checkLink } = await supabase
    .from("resumes")
    .select("id, job_id")
    .eq("id", resumeId)
    .single();
  console.log("Verified resume links to job:", checkLink);

  // 5. Execute the dissociation logic (simulating the DELETE job route step 1)
  console.log("Executing dissociation logic: UPDATE resumes SET job_id = null WHERE job_id = jobId");
  const { error: updateErr } = await supabase
    .from("resumes")
    .update({ job_id: null })
    .eq("job_id", jobId);

  if (updateErr) {
    console.error("Dissociation failed:", updateErr);
  } else {
    console.log("Dissociation succeeded!");
  }

  // 6. Execute job deletion logic (simulating the DELETE job route step 2)
  console.log("Deleting job...");
  const { error: delJobErr } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId);

  if (delJobErr) {
    console.error("Failed to delete job:", delJobErr);
  } else {
    console.log("Job deleted successfully!");
  }

  // 7. Verify that the resume still exists in the database with job_id = null
  console.log("Verifying resume retention...");
  const { data: finalResume, error: finalResumeErr } = await supabase
    .from("resumes")
    .select("id, job_id")
    .eq("id", resumeId)
    .single();

  if (finalResumeErr) {
    console.error("Verification failed: Resume row was deleted! CASCADE constraint must have triggered.", finalResumeErr);
  } else {
    console.log("Verification succeeded: Resume row was PRESERVED in the DB!", finalResume);
  }

  // 8. Cleanup test resume
  console.log("Cleaning up test resume...");
  await supabase.from("resumes").delete().eq("id", resumeId);
  console.log("Cleanup complete!");
}

run();
