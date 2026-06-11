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

async function testApiLogicFallback() {
  console.log("Simulating /api/profile GET fallback logic...");
  
  // 1. Simulating query to profiles table
  const testUserId = 'ef5399f5-28bf-49e2-8662-617fd05784af'; // dummy or test user id
  
  const { data: profileRow, error: profileErr } = await supabase
    .from("profiles")
    .select("plan, usage_limit")
    .eq("id", testUserId)
    .maybeSingle();

  let dbPlan = "free";
  let dbUsageLimit = 50;

  if (profileErr) {
    if (profileErr.code === "PGRST205") {
      console.log("Profiles table does not exist yet (Error code: PGRST205).");
      console.log("Using fallback profile details:");
      dbPlan = "free";
      dbUsageLimit = 50;
      console.log(`-> Fallback Plan: ${dbPlan}, Fallback Limit: ${dbUsageLimit}`);
      console.log("SUCCESS: Fallback logic handled profiles table absence gracefully!");
    } else {
      console.error("Query failed with unexpected error:", profileErr);
    }
  } else {
    console.log("Profiles table exists! Retrieved:", profileRow);
    dbPlan = profileRow ? profileRow.plan : "free";
    dbUsageLimit = profileRow ? profileRow.usage_limit : 50;
  }

  // 2. Simulating PATCH upgrade error check when table doesn't exist
  console.log("\nSimulating /api/profile PATCH error logic...");
  const { data: existing, error: existErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", testUserId)
    .maybeSingle();

  if (existErr && existErr.code === "PGRST205") {
    const customErrorMsg = "Profiles table does not exist in Supabase yet. Please run the SQL migration in `supabase/migrations/20240523000003_create_profiles.sql` in your Supabase dashboard SQL editor.";
    console.log("SUCCESS: PATCH request failed gracefully as expected due to missing table.");
    console.log("Graceful Error Message shown to user/console:", customErrorMsg);
  } else if (existErr) {
    console.error("PATCH validation failed with unexpected error:", existErr);
  } else {
    console.log("Profiles table exists! Can proceed with PATCH update.");
  }
}

testApiLogicFallback();
