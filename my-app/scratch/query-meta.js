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
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("Attempting to query table schemas via PostgREST...");
  const { data, error } = await supabase
    .from('resumes')
    .select('id, job_id')
    .limit(1);

  if (error) {
    console.error("Failed to query resumes:", error);
  } else {
    console.log("Query on resumes succeeded! Sample:", data);
  }

  // Attempting to query information_schema (usually fails via PostgREST unless exposed, but let's check)
  try {
    const { data: infoData, error: infoError } = await supabase
      .from('information_schema.columns')
      .select('*')
      .eq('table_name', 'resumes');
    console.log("information_schema response:", { infoData, infoError });
  } catch (e) {
    console.log("information_schema query threw error:", e);
  }
}

run();
