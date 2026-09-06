-- Voice calls table for storing Vapi call results
create table if not exists voice_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  vapi_call_id text not null unique,
  candidate_name text,
  candidate_phone text not null,
  status text not null default 'queued',
  questions jsonb not null default '[]'::jsonb,
  answers jsonb,
  transcript text,
  summary text,
  call_duration_seconds integer,
  cost numeric(10, 4),
  ended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups
create index if not exists idx_voice_calls_owner on voice_calls(owner_id);
create index if not exists idx_voice_calls_resume on voice_calls(resume_id);
create index if not exists idx_voice_calls_vapi on voice_calls(vapi_call_id);

-- RLS policies
alter table voice_calls enable row level security;

create policy "Users can view own voice calls"
  on voice_calls for select
  using (auth.uid() = owner_id);

create policy "Users can insert own voice calls"
  on voice_calls for insert
  with check (auth.uid() = owner_id);

create policy "Users can update own voice calls"
  on voice_calls for update
  using (auth.uid() = owner_id);
