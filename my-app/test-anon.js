const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase
    .from("jobs")
    .select("title")
    .limit(1);
    
  console.log("Jobs query:", error || "Success");

  const { data: res, error: err2 } = await supabase
    .from("resumes")
    .select("id")
    .limit(1);

  console.log("Resumes query:", err2 || "Success", res);
  
  if (res && res.length > 0) {
      const { error: updErr } = await supabase
        .from("resumes")
        .update({ status: "uploaded" })
        .eq("id", res[0].id);
        
      console.log("Update check:", updErr || "Success");
  }
}
run();
