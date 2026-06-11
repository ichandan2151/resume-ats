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
  const email = 'testuser@example.com';
  const password = 'password123';

  console.log(`Checking/Creating user ${email}...`);

  // Try listing users or creating it
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) {
    if (error.message.includes('already exists') || error.message.includes('already registered')) {
      console.log("User already exists, update password to ensure it is password123...");
      
      // We need to list users to find the id
      const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error("List users failed:", listError);
        return;
      }
      
      const existingUser = userList.users.find(u => u.email === email);
      if (existingUser) {
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          existingUser.id,
          { password }
        );
        if (updateError) {
          console.error("Failed to update password:", updateError);
        } else {
          console.log("Password updated successfully.");
        }
      } else {
        console.error("Could not find user in list even though it says it exists.");
      }
    } else {
      console.error("Failed to create user:", error);
    }
  } else {
    console.log("Created user successfully:", data.user.email);
  }
}

run();
