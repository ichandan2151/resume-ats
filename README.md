# AI-Powered Resume ATS & Matcher

An advanced, premium Applicant Tracking System (ATS) built with **Next.js**, **Supabase**, and **OpenAI**. The application ingests, parses, analyzes, scores, and filters resumes, allowing recruiters and hiring managers to manage candidates at scale using either deep AI evaluation or rapid keyword-based local matching.

---

## 🚀 Key Features

- **Multi-Format Resume Ingestion:** Upload resumes in PDF, DOCX, or Plain Text format.
- **Bulk Uploading Options:**
  - **ZIP Uploads:** Extract and process multiple resumes from compressed directories.
  - **Google Drive Integration:** Import individual files or entire folders recursively via the native Google Drive Picker.
- **Dual-Mode Screening Engine (AI vs. Local Keywords):**
  - **AI-Powered Screening (ON):** Uses **OpenAI GPT-4o-mini** to extract high-fidelity structured profile details (full name, email, phone, location, skills, experience timeline, education, projects, certifications, and publications) and perform detailed alignment evaluation.
  - **Local Keyword Matching (OFF):** Performs local keyword and skill matching using `calculateMatchScore()`, offering near-instant scoring and strengths/weaknesses breakdowns without calling external APIs.
  - **Interactive Toggles:** Toggle AI-powered screening on/off during campaign creation or directly inside the campaign dashboard. Switching modes automatically re-scores all candidates.
- **Intelligent Background Processing & Concurrency:**
  - Parallelized/concurrent parsing for faster bulk uploads.
  - Automatic exponential backoff (retries up to 4 times) for OpenAI `429 Rate Limit`, `Quota Exceeded`, and `5xx Server` errors.
  - Automatic legacy path reconstruction to handle retries for candidates with missing storage paths.
- **Rich Candidate Directory & Compact View:**
  - Cleaned and compact table layout focused on essential contact and fit metrics.
  - **Quick Contact Copy Helper:** Interactive popup helper to easily copy a candidate's email and phone number with a single click.
  - Real-time multi-dimensional search (name, email, skills) and dynamic filters (location, minimum years of experience, visa status, work authorization, parsing status).
- **Automated Email Notifications:**
  - Sends a consolidated summary email of parsing success/failure statistics, candidate scores, and direct dashboard links once all pending uploads for a specific job run are complete.
  - Integrates **Resend API** with a verified custom sender domain (`patternix.app`) to guarantee delivery. Fallback to **Nodemailer (SMTP)** is included.

---

## 🛠 Tech Stack

| Component              | Technology                                                            | Description                                                 |
| :--------------------- | :-------------------------------------------------------------------- | :---------------------------------------------------------- |
| **Frontend/Framework** | [Next.js 15 (App Router)](https://nextjs.org/)                        | Core application environment & routing API endpoints.       |
| **Styling**            | [TailwindCSS 4](https://tailwindcss.com/) & Vanilla CSS               | Premium dark-themed UI components and layouts.              |
| **Database & Auth**    | [Supabase Postgres](https://supabase.com/)                            | Persistent storage, Auth handling, and custom RLS policies. |
| **Storage**            | [Supabase Storage](https://supabase.com/docs/guides/storage)          | Resume file hosting under user-scoped structures.           |
| **AI Processing**      | [OpenAI GPT-4o-mini SDK](https://openai.com/)                         | Structured resume parsing and objective scoring.            |
| **Mail Services**      | [Resend](https://resend.com/) & [Nodemailer](https://nodemailer.com/) | HTML notification dispatchers.                              |
| **Libraries**          | `pdf-parse`, `mammoth`, `jszip`                                       | Raw text extraction from PDFs, DOCXs, and ZIP files.        |

---

## 🔑 Environment Variables Setup

Create a `.env.local` file in the root of the `my-app` directory and populate it with the following configuration keys:

```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key # Required for background workers to bypass RLS

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key # Used for parsing resumes via OpenAI SDK

# Google Drive Integration API Keys
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_API_KEY=your-google-api-key-for-picker

# Email Service Configuration
RESEND_API_KEY=re_your-resend-api-key # Primary email API provider
SMTP_FROM="ATS Notifications <notifications@patternix.app>" # Verified sender address

# Nodemailer / SMTP Fallback Configuration (Optional if Resend is configured)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_SECURE=false

# App Deployment URL
NEXT_PUBLIC_APP_URL=https://your-deployed-app.vercel.app
```

---

## 🗄 Database Schema Details

The database schema is configured in Supabase with the following tables and Row Level Security (RLS) policies:

### 1. `profiles` Table

Stores user subscription plans, email addresses, and usage quotas. Synced automatically via a PostgreSQL trigger on user sign-up.

- `id` (UUID, Primary Key, references `auth.users`)
- `plan` (TEXT, Default: `'free'`)
- `usage_limit` (INTEGER, Default: `50`)
- `full_name` / `phone` / `email` / `avatar_url` (TEXT)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 2. `jobs` Table

Stores job/campaign descriptions and keywords used to match candidates.

- `id` (UUID, Primary Key)
- `owner_id` (UUID, references `profiles.id`)
- `title` (TEXT)
- `company` (TEXT, Optional)
- `location` (TEXT, Optional)
- `description` (TEXT, encoded structure storing description text, keywords, and AI screening toggle state)

### 3. `resumes` Table

Stores candidate details, parsed JSON objects, matching scores, and references to files uploaded to Storage.

- `id` (UUID, Primary Key)
- `owner_id` (UUID, references `profiles.id`)
- `job_id` (UUID, Optional, references `jobs.id`)
- `original_filename` / `storage_bucket` / `storage_path` (TEXT)
- `status` (TEXT enum: `'uploaded'`, `'scored'`, `'error'`)
- `score` (INTEGER, matching rating from `0` to `100`)
- `score_breakdown` (JSONB, strengths/weaknesses/relevance justification)
- `parsed_json` (JSONB, full parsed profile details, including `notified` status indicator)
- `full_name` / `email` / `phone` (TEXT, cached indices for search indexing)
- `scoring_version` (TEXT, e.g. `'ai-1.0'` or `'keyword-1.0'`)

### Custom ENUM Types

- `visa_status_enum` (Values: `'citizen'`, `'green_card'`, `'h1b'`, `'opt'`, `'stem_opt'`, `'cpt'`)
- `work_auth_enum` (Values: `'authorized'`, `'sponsorship'`)

---

## 🛠 Deep Dive: How the Core Integrations Work

### 🧬 OpenAI Integration ([lib/openai.ts](file:///Users/chandan/Desktop/resume-ats/my-app/lib/openai.ts))

1. **Input Truncation:** Sanitizes text extraction, removing null characters and truncating the input to the first 20,000 characters to prevent token overflow.
2. **Strict JSON Mode:** Invokes `gpt-4o-mini` with `response_format: { type: "json_object" }` ensuring structured output matches our exact TS types.
3. **Robust Retry Engine:**
   - If OpenAI throws a **429 (Rate Limit / Quota)** or **5xx** error, the engine runs up to 4 retries with exponential backoff.
   - Handles content safety violations, network interruptions, and malformed JSON parses gracefully.

### 🤖 Dual-Mode Screening Mechanics

- **Campaign Encoding ([lib/campaign.ts](file:///Users/chandan/Desktop/resume-ats/my-app/lib/campaign.ts)):**
  The `jobs.description` column encodes the original job description, its extracted keywords, and the `aiScreening` state in a single string delimited by special metadata blocks:
  ```
  [Description Text]
  ---KEYWORDS---
  ["keyword1", "keyword2", ...]
  ---AI_SCREENING---
  true/false
  ```
- **Real-Time Toggle Behavior:**
  When a campaign's AI-Powered Screening is toggled:
  - If **Enabled (ON)**: Candidates' statuses are reset to `uploaded` and screened concurrently using background workers calling OpenAI.
  - If **Disabled (OFF)**: Candidates' profiles are matched locally against the campaign's extracted keywords instantly, recalculating scores, strengths, and weaknesses without delay or API overhead.

### ✉️ Resend & Mail Integration ([lib/mail.ts](file:///Users/chandan/Desktop/resume-ats/my-app/lib/mail.ts))

1. **Custom Domain Dispatch:** Deliveries use the verified sender address (`notifications@patternix.app`) to ensure bypass of sandbox limitations.
2. **Consolidation Check (`checkAndSendJobNotification`):**
   - Triggered immediately after background parsing updates a candidate's status to `'scored'` or `'error'`.
   - Queries `resumes` database: If any resume for the job is still in status `'uploaded'`, it cancels the notification email.
   - Once all files are processed, a single aggregated email listing success rates, failure flags, and individual scores is compiled and delivered.
   - Updates the `parsed_json.notified` flag to `true` for all successfully notified resumes to prevent duplicate emails.

### 📂 Supabase Client & Storage Integration

- Client initialization is split between `lib/supabase/browser.ts` (client-side cookies) and `lib/supabase/server.ts` (Next.js server environment).
- During background parsing, the system instantiates a `@supabase/supabase-js` administration client using the `SUPABASE_SERVICE_ROLE_KEY` to bypass standard RLS restrictions.

---

## 🏃‍♂️ Running Locally

1. **Clone the repository and install dependencies:**

   ```bash
   cd my-app
   npm install
   ```

2. **Configure Supabase:**
   Create the necessary tables (`profiles`, `jobs`, `resumes`) in your Supabase database instance.

3. **Run the development server:**

   ```bash
   npm run dev
   ```
