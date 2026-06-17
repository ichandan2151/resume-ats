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
  const { data: allResumes, error } = await supabase
    .from("resumes")
    .select("id, email, job_id, original_filename, created_at, status");

  if (error) {
    console.error("Error fetching resumes:", error);
    return;
  }

  const resumesWithoutEmail = allResumes.filter(r => !r.email);
  console.log(`Resumes without email: ${resumesWithoutEmail.length}`);

  // Count by filename
  const filenameCounts: Record<string, number> = {};
  resumesWithoutEmail.forEach(r => {
    filenameCounts[r.original_filename] = (filenameCounts[r.original_filename] || 0) + 1;
  });

  console.log("Top 20 filenames without email:");
  Object.entries(filenameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([filename, count]) => {
      console.log(`  ${filename}: ${count} occurrences`);
    });

  // Check some details of a duplicate filename
  const sampleFilename = Object.keys(filenameCounts).find(f => filenameCounts[f] > 1);
  if (sampleFilename) {
    console.log(`\nSample duplicates for filename: ${sampleFilename}`);
    allResumes
      .filter(r => r.original_filename === sampleFilename)
      .slice(0, 10)
      .forEach(r => {
        console.log(`  ID: ${r.id}, JobID: ${r.job_id}, Email: ${r.email}, Status: ${r.status}, CreatedAt: ${r.created_at}`);
      });
  }
}

run().catch(console.error);
