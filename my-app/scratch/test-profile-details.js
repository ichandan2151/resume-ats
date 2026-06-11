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
  console.log("Checking if profiles table and new columns are active in Supabase...");
  const { data, error } = await supabase
    .from("profiles")
    .select("id, plan, usage_limit, full_name, phone, avatar_url, email")
    .limit(1);

  if (error) {
    if (error.code === 'PGRST205') {
      console.log("\n[INFO]: The profiles table does not exist in the schema cache yet.");
      console.log("-> Action: Run the migration file in the Supabase dashboard SQL Editor:");
      console.log("   /Users/chandan/Desktop/resume-ats/my-app/supabase/migrations/20240523000003_create_profiles.sql");
    } else if (error.message.includes('column') || error.message.includes('not found')) {
      console.log("\n[ERROR]: The profiles table exists, but some of the new columns (full_name, phone, avatar_url, email) are missing.");
      console.log("-> Action: Re-run/update the migration script in Supabase.");
    } else {
      console.error("Query failed with other database error:", error);
    }
  } else {
    console.log("\n[SUCCESS]: Profiles table and all columns (full_name, phone, avatar_url, email) are active and queryable!");
    console.log("Sample row:", data);
  }
}

run();
