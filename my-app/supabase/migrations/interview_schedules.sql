-- ============================================
-- INTERVIEW SCHEDULES
-- ============================================
create table if not exists interview_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  voice_call_id uuid references voice_calls(id) on delete set null,

  -- Public booking token (sent in email link)
  token text not null unique default encode(gen_random_bytes(24), 'hex'),

  candidate_name text,
  candidate_email text not null,

  -- Available time slots the recruiter offers
  available_slots jsonb not null default '[]'::jsonb,
  -- The slot the candidate picked
  selected_slot timestamptz,

  -- pending = invite sent, booked = candidate picked a slot, cancelled = either party cancelled
  status text not null default 'pending',

  -- Interview metadata
  interview_type text not null default 'video',       -- video, phone, in-person
  duration_minutes int not null default 30,
  location text,                                       -- Zoom link, office address, phone number, etc.
  notes text,                                          -- Prep instructions for the candidate

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_interview_schedules_owner on interview_schedules(owner_id);
create index if not exists idx_interview_schedules_resume on interview_schedules(resume_id);
create index if not exists idx_interview_schedules_token on interview_schedules(token);
create index if not exists idx_interview_schedules_status on interview_schedules(status);

alter table interview_schedules enable row level security;

-- Owners can manage their own schedules
create policy "Users can view own schedules"
  on interview_schedules for select using (auth.uid() = owner_id);
create policy "Users can insert own schedules"
  on interview_schedules for insert with check (auth.uid() = owner_id);
create policy "Users can update own schedules"
  on interview_schedules for update using (auth.uid() = owner_id);
create policy "Users can delete own schedules"
  on interview_schedules for delete using (auth.uid() = owner_id);

-- Public access by token (for candidates booking via the link)
-- This is handled via service-role in the API, not RLS
