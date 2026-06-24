# AI-Powered Resume ATS & Matcher

An advanced, premium Applicant Tracking System (ATS) built with **Next.js**, **Supabase**, and **Google Gemini 2.5 Flash**. The application ingests, parses, analyzes, scores, and filters resumes, allowing recruiters and hiring managers to manage candidates at scale.

---

## 🚀 Key Features

- **Multi-Format Resume Ingestion:** Upload resumes in PDF, DOCX, or Plain Text format.
- **Bulk Uploading Options:**
  - **ZIP Uploads:** Extract and process multiple resumes from compressed directories.
  - **Google Drive Integration:** Import individual files or entire folders recursively via the native Google Drive Picker.
- **AI-Powered Parsing & Evaluation:**
  - Uses **Gemini 2.5 Flash** to extract high-fidelity structured profile details (full name, email, phone, location, skills, experience timeline, education, projects, certifications, and publications).
  - Generates objective candidate matching scores (0-100) based on specific Job Context (title & description), along with a breakdown of strengths, weaknesses, and relevance justification.
- **Intelligent Background Processing:**
  - Fires-and-forget uploads using background workers.
  - Staggers bulk/queue processing with a 10-second offset delay to respect Gemini API rate limits (2 RPM).
  - Includes automatic exponential backoff (retries up to 3 times) for `429 Rate Limit` and `5xx Server` errors.
- **Rich Candidate Directory & Filtering:**
  - Real-time multi-dimensional search (name, email, skills).
  - Dynamic dropdown/numeric filters (location, minimum years of experience, visa status, work authorization, parsing status).
  - Interactive select-all pagination controls and bulk candidates deletion.
- **Automated Email Notifications:**
  - Sends a summary email of parsing success/failure statistics, candidate scores, and direct dashboard links.
  - Integrates **Resend API** with **Nodemailer (SMTP)** fallback client.
  - Consolidates notifications—emails are only sent once all pending uploads for a specific job run are complete.

---

## 🛠 Tech Stack

| Component              | Technology                                                            | Description                                                 |
| :--------------------- | :-------------------------------------------------------------------- | :---------------------------------------------------------- |
| **Frontend/Framework** | [Next.js 16 (App Router)](https://nextjs.org/)                        | Core application environment & routing API endpoints.       |
| **Styling**            | [TailwindCSS 4](https://tailwindcss.com/) & Vanilla CSS               | Premium dark-themed UI components and layouts.              |
| **Database & Auth**    | [Supabase Postgres](https://supabase.com/)                            | Persistent storage, Auth handling, and custom RLS policies. |
| **Storage**            | [Supabase Storage](https://supabase.com/docs/guides/storage)          | Resume file hosting under user-scoped structures.           |
| **AI Processing**      | [Google Gemini 2.5 Flash SDK](https://ai.google.dev/)                 | Structured resume parsing and objective scoring.            |
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

# Google AI & Gemini API Configuration
GEMINI_API_KEY=your-gemini-api-key # Used for parsing resumes via Gemini SDK

# Google Drive Integration API Keys
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_API_KEY=your-google-api-key-for-picker

# Email Service Configuration
RESEND_API_KEY=re_your-resend-api-key # Primary email API provider
SMTP_FROM="ATS Notifications <onboarding@resend.dev>" # Verified sender address

# Nodemailer / SMTP Fallback Configuration (Optional if Resend is configured)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_SECURE=false
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

Stores job descriptions and contexts used by Gemini to match candidates.

- `id` (UUID, Primary Key)
- `owner_id` (UUID, references `profiles.id`)
- `title` (TEXT)
- `description` (TEXT)

### 3. `resumes` Table

Stores candidates details, parsed JSON objects, matching scores, and references to files uploaded to Storage.

- `id` (UUID, Primary Key)
- `owner_id` (UUID, references `profiles.id`)
- `job_id` (UUID, Optional, references `jobs.id`)
- `original_filename` / `storage_bucket` / `storage_path` (TEXT)
- `status` (TEXT enum: `'uploaded'`, `'scored'`, `'error'`)
- `score` (INTEGER, matching rating from `0` to `100`)
- `score_breakdown` (JSONB, strengths/weaknesses)
- `parsed_json` (JSONB, full parsed profile details, including `notified` status indicator)
- `full_name` / `email` / `phone` (TEXT, cached indices for indexing)

### Custom ENUM Types

- `visa_status_enum` (Values: `'citizen'`, `'green_card'`, `'h1b'`)
- `work_auth_enum` (Values: `'authorized'`, `'sponsorship'`)

---

## 🛠 Deep Dive: How the Core Integrations Work

### 🧬 Google Gemini Integration ([lib/gemini.ts](file:///Users/chandan/Desktop/resume-ats/my-app/lib/gemini.ts))

1. **Input Truncation:** Sanitizes text extraction, removing null characters and truncating the input to the first 20,000 characters to prevent token overflow.
2. **Strict JSON Mode:** Requests raw JSON data matching a pre-defined schema, filtering out any Markdown code block decorations (` ```json `).
3. **Robust Retry Engine:**
   - If Gemini throws a **429 (Resource Exhausted)** error, the engine parses the `RetryInfo` headers to detect the exact wait time required, defaulting to exponential backoff.
   - Handles safety filter blocks, connection failures, and invalid JSON parses gracefully.

### ✉️ Resend & Mail Integration ([lib/mail.ts](file:///Users/chandan/Desktop/resume-ats/my-app/lib/mail.ts))

1. **Dynamic Provider Loading:** Attempts to send notifications using the **Resend API SDK** client. If the credentials are not set, it attempts a traditional **SMTP (Nodemailer)** payload.
2. **Consolidation Check (`checkAndSendJobNotification`):**
   - Triggered immediately after background parsing updates a candidate's status to `'scored'` or `'error'`.
   - Queries `resumes` database: If any resume for the job is still in status `'uploaded'`, it cancels the notification email.
   - Once all files are processed, a single aggregated email listing success rates, failure flags, and individual scores is compiled and delivered.
   - Updates the `parsed_json.notified` flag to `true` for all successfully notified resumes to prevent duplicate emails.

### 📂 Supabase Client & Storage Integration

- The application splits client initialization between `lib/supabase/browser.ts` (client-side cookies logic) and `lib/supabase/server.ts` (Next.js server environments).
- During background parsing, where HTTP context is terminated, the system instantiates a `@supabase/supabase-js` administration client using the `SUPABASE_SERVICE_ROLE_KEY` to bypass standard RLS restrictions.

---

## 🏃‍♂️ Running Locally

1.  **Clone the repository and install dependencies:**

    ```bash
    cd my-app
    npm install
    ```

2.  **Configure Supabase:**
    Create the necessary tables (`profiles`, `jobs`, `resumes`) in your Supabase database instance.

3.  **Run the development server:**

    ```bash
    npm run dev
    ```
