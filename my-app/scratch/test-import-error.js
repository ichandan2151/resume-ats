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

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Authenticating...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@example.com',
    password: 'password123'
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    return;
  }

  const userId = authData.user.id;
  
  // 1. Create a dummy directory resume
  console.log("Creating dummy directory resume...");
  const { data: srcResume, error: srcErr } = await supabase
    .from("resumes")
    .insert({
      owner_id: userId,
      job_id: null,
      source: "upload",
      original_filename: "test_dir_resume.pdf",
      status: "scored",
      full_name: "John Doe",
      email: "johndoe@example.com",
      phone: "123-456-7890",
      parsed_json: { skills: ["React"] }
    })
    .select("*")
    .single();

  if (srcErr) {
    console.error("Failed to create dummy directory resume:", srcErr);
    return;
  }

  console.log("Created directory resume:", srcResume.id);

  // 2. Create a test job
  console.log("Creating test job...");
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      owner_id: userId,
      title: "Import Target Job",
      company: "Test Target",
      description: "Need React"
    })
    .select("id")
    .single();

  if (jobErr) {
    console.error("Failed to create job:", jobErr);
    // Cleanup resume
    await supabase.from("resumes").delete().eq("id", srcResume.id);
    return;
  }

  const jobId = job.id;
  console.log("Created job:", jobId);

  // 3. Try inserting using the exact query from app/api/jobs/[jobId]/resumes/import/route.ts
  console.log("Attempting to import (insert cloned resume)...");
  const { data: newRow, error: insErr } = await supabase
    .from("resumes")
    .insert({
      owner_id: userId,
      job_id: jobId,
      source: "upload",
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
    .select("id")
    .single();

  if (insErr) {
    console.error("IMPORT FAILED WITH DB ERROR:", insErr);
  } else {
    console.log("IMPORT SUCCEEDED! Cloned resume ID:", newRow.id);
    // Cleanup new row
    await supabase.from("resumes").delete().eq("id", newRow.id);
  }

  // Cleanup
  console.log("Cleaning up...");
  await supabase.from("jobs").delete().eq("id", jobId);
  await supabase.from("resumes").delete().eq("id", srcResume.id);
  console.log("Cleanup complete!");
}

run();
