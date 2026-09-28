-- ============================================
-- 1. AI CALL LOGS (Governance & Monitoring)
-- ============================================
create table if not exists ai_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                -- 'openai', 'claude', 'gemini'
  model text not null,                   -- 'gpt-4o-mini', 'claude-sonnet-4-20250514', etc.
  feature text not null,                 -- 'parse', 'score', 'copilot', 'compare', 'rag-search', etc.
  input_summary text,                    -- Truncated input for audit (no PII in full prompts)
  output_summary text,                   -- Truncated output summary
  success boolean not null default true,
  latency_ms int,
  tokens_input int,
  tokens_output int,
  cost_usd numeric(10,6),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_logs_owner on ai_logs(owner_id);
create index if not exists idx_ai_logs_feature on ai_logs(feature);
create index if not exists idx_ai_logs_provider on ai_logs(provider);
create index if not exists idx_ai_logs_created on ai_logs(created_at desc);

alter table ai_logs enable row level security;

create policy "Users can view own ai logs" on ai_logs for select using (auth.uid() = owner_id);
create policy "Users can insert own ai logs" on ai_logs for insert with check (auth.uid() = owner_id);

-- ============================================
-- 2. RESUME EMBEDDINGS (RAG / Vector Search)
-- ============================================
-- Enable pgvector extension (must be run as superuser/service role)
create extension if not exists vector;

create table if not exists resume_embeddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  content_text text not null,            -- The text that was embedded
  embedding vector(1536),                -- OpenAI text-embedding-3-small dimension
  created_at timestamptz not null default now(),
  unique(resume_id)
);

create index if not exists idx_resume_embeddings_owner on resume_embeddings(owner_id);
create index if not exists idx_resume_embeddings_job on resume_embeddings(job_id);

-- HNSW index for fast similarity search
create index if not exists idx_resume_embeddings_vector
  on resume_embeddings using hnsw (embedding vector_cosine_ops);

alter table resume_embeddings enable row level security;

create policy "Users can view own embeddings" on resume_embeddings for select using (auth.uid() = owner_id);
create policy "Users can insert own embeddings" on resume_embeddings for insert with check (auth.uid() = owner_id);
create policy "Users can delete own embeddings" on resume_embeddings for delete using (auth.uid() = owner_id);

-- ============================================
-- 3. Semantic search function (RPC)
-- ============================================
create or replace function match_resumes(
  query_embedding vector(1536),
  match_owner_id uuid,
  match_job_id uuid default null,
  match_threshold float default 0.5,
  match_count int default 20
)
returns table (
  resume_id uuid,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    re.resume_id,
    1 - (re.embedding <=> query_embedding) as similarity
  from resume_embeddings re
  where re.owner_id = match_owner_id
    and (match_job_id is null or re.job_id = match_job_id)
    and 1 - (re.embedding <=> query_embedding) > match_threshold
  order by re.embedding <=> query_embedding
  limit match_count;
end;
$$;
