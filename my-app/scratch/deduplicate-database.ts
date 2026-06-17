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

interface ResumeRow {
  id: string;
  owner_id: string;
  job_id: string | null;
  email: string | null;
  storage_path: string | null;
  original_filename: string;
  status: string;
  created_at: string;
}

// Function to rank status (lower score is better)
function getStatusRank(status: string): number {
  switch (status) {
    case 'scored': return 0;
    case 'processing': return 1;
    case 'uploaded': return 2;
    case 'error': return 3;
    case 'failed': return 3;
    default: return 4;
  }
}

// Function to choose the best resume in a group to keep
function chooseBestResume(resumes: ResumeRow[]): ResumeRow {
  return [...resumes].sort((a, b) => {
    // 1. Prefer by status rank (scored is best)
    const rankA = getStatusRank(a.status);
    const rankB = getStatusRank(b.status);
    if (rankA !== rankB) return rankA - rankB;

    // 2. Prefer latest created_at
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

async function run() {
  console.log("Starting database deduplication cleanup...");

  const { data: allResumes, error } = await supabase
    .from("resumes")
    .select("id, owner_id, job_id, email, storage_path, original_filename, status, created_at");

  if (error) {
    console.error("Error fetching resumes:", error);
    return;
  }

  console.log(`Total resumes found: ${allResumes.length}`);

  // Group resumes by owner_id
  const resumesByOwner: Record<string, ResumeRow[]> = {};
  allResumes.forEach(r => {
    resumesByOwner[r.owner_id] = resumesByOwner[r.owner_id] || [];
    resumesByOwner[r.owner_id].push(r);
  });

  const idsToDelete: string[] = [];

  for (const [ownerId, ownerResumes] of Object.entries(resumesByOwner)) {
    console.log(`\nProcessing resumes for owner: ${ownerId} (${ownerResumes.length} resumes)`);

    // --- Part 1: Deduplicate Candidate Directory resumes (job_id IS NULL) ---
    const directoryResumes = ownerResumes.filter(r => !r.job_id);
    
    // Group directory resumes by unique identity
    const dirGroups: Record<string, ResumeRow[]> = {};
    directoryResumes.forEach(r => {
      const emailKey = r.email?.trim().toLowerCase();
      const pathKey = r.storage_path;
      const fileKey = r.original_filename;

      const key = emailKey 
        ? `email:${emailKey}` 
        : (pathKey ? `path:${pathKey}` : `file:${fileKey}`);
        
      dirGroups[key] = dirGroups[key] || [];
      dirGroups[key].push(r);
    });

    console.log(`Candidate Directory unique candidates: ${Object.keys(dirGroups).length}`);

    for (const [key, group] of Object.entries(dirGroups)) {
      if (group.length > 1) {
        const best = chooseBestResume(group);
        console.log(`  Directory group [${key}]: ${group.length} duplicates. Keeping ID ${best.id} (Status: ${best.status})`);
        group.forEach(r => {
          if (r.id !== best.id) {
            idsToDelete.push(r.id);
          }
        });
      }
    }

    // --- Part 2: Deduplicate resumes linked to jobs (job_id IS NOT NULL) ---
    const jobResumes = ownerResumes.filter(r => r.job_id);
    
    // Group job resumes by job_id + unique identity
    const jobGroups: Record<string, ResumeRow[]> = {};
    jobResumes.forEach(r => {
      const emailKey = r.email?.trim().toLowerCase();
      const pathKey = r.storage_path;
      const fileKey = r.original_filename;

      const candidateKey = emailKey 
        ? `email:${emailKey}` 
        : (pathKey ? `path:${pathKey}` : `file:${fileKey}`);
        
      const key = `${r.job_id}#${candidateKey}`;
      jobGroups[key] = jobGroups[key] || [];
      jobGroups[key].push(r);
    });

    console.log(`Unique job-candidate pairs: ${Object.keys(jobGroups).length}`);

    for (const [key, group] of Object.entries(jobGroups)) {
      if (group.length > 1) {
        const best = chooseBestResume(group);
        console.log(`  Job group [${key}]: ${group.length} duplicates. Keeping ID ${best.id} (Status: ${best.status})`);
        group.forEach(r => {
          if (r.id !== best.id) {
            idsToDelete.push(r.id);
          }
        });
      }
    }
  }

  console.log(`\nTotal duplicate resumes identified for deletion: ${idsToDelete.length}`);

  if (idsToDelete.length > 0) {
    console.log("Deleting duplicate records from Supabase in chunks...");
    
    // Delete in chunks of 100 to avoid query size limits
    const chunkSize = 100;
    for (let i = 0; i < idsToDelete.length; i += chunkSize) {
      const chunk = idsToDelete.slice(i, i + chunkSize);
      const { error: delErr } = await supabase
        .from("resumes")
        .delete()
        .in("id", chunk);
        
      if (delErr) {
        console.error(`Error deleting chunk starting at index ${i}:`, delErr);
      } else {
        console.log(`  Deleted indices ${i} to ${Math.min(i + chunkSize, idsToDelete.length)}...`);
      }
    }
    console.log("Cleanup delete operations complete!");
  } else {
    console.log("No duplicates found to delete.");
  }
}

run().catch(console.error);
