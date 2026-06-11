const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
  env.SUPABASE_SERVICE_ROLE_KEY
);

const candidates = [
  "upload",
  "import",
  "google_drive",
  "drive",
  "dropbox",
  "manual",
  "api",
  "email",
  "linkedin",
  "web",
  "url",
  "direct",
  "referral"
];

async function run() {
  console.log("Authenticating as admin...");
  
  // Create a temporary job
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      owner_id: 'ef5399f5-28bf-49e2-8662-617fd05784af',
      title: "Temp Probe Job",
      description: "Temp"
    })
    .select("id")
    .single();

  if (jobErr) {
    console.error("Job insert failed:", jobErr);
    return;
  }
  const jobId = job.id;
  console.log("Created temp job:", jobId);

  for (const source of candidates) {
    const { data, error } = await supabase
      .from("resumes")
      .insert({
        job_id: jobId,
        source: source,
        original_filename: "probe.pdf",
        status: "uploaded"
      })
      .select("id");

    if (error) {
      console.log(`- Source "${source}": FAILED - ${error.message}`);
    } else {
      console.log(`- Source "${source}": SUCCESS!`);
      // Cleanup
      await supabase.from("resumes").delete().eq("id", data[0].id);
    }
  }

  // Cleanup job
  await supabase.from("jobs").delete().eq("id", jobId);
  console.log("Cleanup complete!");
}

run();
