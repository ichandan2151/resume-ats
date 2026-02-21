-- Create ENUM types if they don't exist
do $$ begin
  create type public.visa_status_enum as enum ('citizen', 'green_card', 'h1b');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.work_auth_enum as enum ('authorized', 'sponsorship');
exception
  when duplicate_object then null;
end $$;

-- Add new columns for filtering (Updated with ENUMs)
alter table "resumes" 
add column if not exists "candidate_location" text,
add column if not exists "years_experience" integer,
add column if not exists "visa_status" visa_status_enum,
add column if not exists "work_authorization" work_auth_enum;
