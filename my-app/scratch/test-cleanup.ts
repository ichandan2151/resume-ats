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

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Cleaning up test jobs and test resumes...");

  // Delete jobs that have test-related names or belong to testuser
  const { data: testJobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title")
    .ilike("title", "%Senior Staff Frontend Architect%");

  if (jobsErr) {
    console.error("Error fetching test jobs:", jobsErr);
    return;
  }

  console.log(`Found ${testJobs?.length || 0} test jobs to clean up.`);

  for (const job of testJobs || []) {
    console.log(`Deleting job: ${job.title} (${job.id})`);
    
    // Dissociate or delete resumes for this job
    const { error: resErr } = await supabase
      .from("resumes")
      .delete()
      .eq("job_id", job.id);
      
    if (resErr) {
      console.error(`Failed to delete resumes for job ${job.id}:`, resErr);
    }

    const { error: delErr } = await supabase
      .from("jobs")
      .delete()
      .eq("id", job.id);

    if (delErr) {
      console.error(`Failed to delete job ${job.id}:`, delErr);
    }
  }

  // Delete dummy test candidate resumes
  const { error: candErr } = await supabase
    .from("resumes")
    .delete()
    .eq("original_filename", "test_candidate_directory_file.pdf");

  if (candErr) {
    console.error("Failed to delete dummy candidate:", candErr);
  }

  console.log("Cleanup finished.");
}

run().catch(console.error);
