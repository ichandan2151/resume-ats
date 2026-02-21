-- Migrate data from old columns to parsed_json before dropping
UPDATE "resumes"
SET "parsed_json" = COALESCE("parsed_json", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'candidate_location', "candidate_location",
    'years_experience', "years_experience",
    'visa_status', "visa_status",
    'work_authorization', "work_authorization"
));

-- Drop redundant columns
alter table "resumes" 
drop column if exists "candidate_location",
drop column if exists "years_experience",
drop column if exists "visa_status",
drop column if exists "work_authorization";
