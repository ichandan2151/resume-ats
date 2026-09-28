-- ============================================
-- 1. CANDIDATE PIPELINE STAGES
-- ============================================
create table if not exists candidate_stages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  stage text not null default 'new',
  moved_at timestamptz not null default now(),
  moved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(resume_id, job_id)
);

create index if not exists idx_candidate_stages_owner on candidate_stages(owner_id);
create index if not exists idx_candidate_stages_job on candidate_stages(job_id);
create index if not exists idx_candidate_stages_stage on candidate_stages(stage);

alter table candidate_stages enable row level security;

create policy "Users can view own stages" on candidate_stages for select using (auth.uid() = owner_id);
create policy "Users can insert own stages" on candidate_stages for insert with check (auth.uid() = owner_id);
create policy "Users can update own stages" on candidate_stages for update using (auth.uid() = owner_id);
create policy "Users can delete own stages" on candidate_stages for delete using (auth.uid() = owner_id);

-- ============================================
-- 2. CANDIDATE NOTES
-- ============================================
create table if not exists candidate_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_candidate_notes_resume on candidate_notes(resume_id);
create index if not exists idx_candidate_notes_owner on candidate_notes(owner_id);

alter table candidate_notes enable row level security;

create policy "Users can view own notes" on candidate_notes for select using (auth.uid() = owner_id);
create policy "Users can insert own notes" on candidate_notes for insert with check (auth.uid() = owner_id);
create policy "Users can update own notes" on candidate_notes for update using (auth.uid() = owner_id);
create policy "Users can delete own notes" on candidate_notes for delete using (auth.uid() = owner_id);

-- ============================================
-- 3. EMAIL TEMPLATES
-- ============================================
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  category text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_templates_owner on email_templates(owner_id);

alter table email_templates enable row level security;

create policy "Users can view own templates" on email_templates for select using (auth.uid() = owner_id);
create policy "Users can insert own templates" on email_templates for insert with check (auth.uid() = owner_id);
create policy "Users can update own templates" on email_templates for update using (auth.uid() = owner_id);
create policy "Users can delete own templates" on email_templates for delete using (auth.uid() = owner_id);

-- ============================================
-- 4. EMAIL SEND LOG
-- ============================================
create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  template_id uuid references email_templates(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create index if not exists idx_email_logs_resume on email_logs(resume_id);
create index if not exists idx_email_logs_owner on email_logs(owner_id);

alter table email_logs enable row level security;

create policy "Users can view own email logs" on email_logs for select using (auth.uid() = owner_id);
create policy "Users can insert own email logs" on email_logs for insert with check (auth.uid() = owner_id);

-- ============================================
-- 5. SMS LOG
-- ============================================
create table if not exists sms_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  resume_id uuid not null references resumes(id) on delete cascade,
  to_phone text not null,
  message text not null,
  status text not null default 'sent',
  twilio_sid text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sms_logs_resume on sms_logs(resume_id);
create index if not exists idx_sms_logs_owner on sms_logs(owner_id);

alter table sms_logs enable row level security;

create policy "Users can view own sms logs" on sms_logs for select using (auth.uid() = owner_id);
create policy "Users can insert own sms logs" on sms_logs for insert with check (auth.uid() = owner_id);

-- ============================================
-- 6. SCORING RUBRICS
-- ============================================
create table if not exists scoring_rubrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id)
);

create index if not exists idx_scoring_rubrics_job on scoring_rubrics(job_id);

alter table scoring_rubrics enable row level security;

create policy "Users can view own rubrics" on scoring_rubrics for select using (auth.uid() = owner_id);
create policy "Users can insert own rubrics" on scoring_rubrics for insert with check (auth.uid() = owner_id);
create policy "Users can update own rubrics" on scoring_rubrics for update using (auth.uid() = owner_id);
create policy "Users can delete own rubrics" on scoring_rubrics for delete using (auth.uid() = owner_id);
