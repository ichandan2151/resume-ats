# AI-Powered Resume ATS & Matcher

An advanced, premium Applicant Tracking System (ATS) built with **Next.js**, **Supabase**, **OpenAI**, and **Anthropic Claude**. The application ingests, parses, analyzes, scores, and filters resumes, allowing recruiters and hiring managers to manage candidates at scale using multi-model AI evaluation, semantic search, agentic workflows, and an AI copilot.

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
- **Claude AI Integration (Anthropic):**
  - **Candidate Comparison:** Deep comparative ranking of 2–5 candidates using Claude Sonnet 4 with verdicts, risk factors, and hiring recommendations.
  - **AI Copilot:** Natural language Q&A for recruiters — ask questions about your candidate pipeline (e.g., "Show me Python developers with 5+ years experience") and get markdown-formatted answers powered by Claude.
  - **Candidate Analysis:** Flexible AI-driven analysis with structured JSON or text responses for any candidate context.
- **RAG Semantic Search:**
  - **Natural Language Search:** Find candidates using plain English queries (e.g., "DevOps engineers with Kubernetes expertise") instead of exact keyword matches.
  - **Vector Embeddings:** Resumes are embedded into 1536-dimensional vectors using OpenAI `text-embedding-3-small` and stored via PostgreSQL `pgvector`.
  - **Similarity Ranking:** Results are ranked by cosine similarity with configurable thresholds and result limits.
- **Agentic Workflow Engine:**
  - **Autonomous Multi-Step Pipeline:** An LLM agent (GPT-4o-mini) orchestrates the full candidate processing flow — parse resume, score candidate, generate screening questions, embed for search, decide pipeline stage, and draft personalized outreach emails.
  - **Batch Processing:** Execute the complete pipeline on up to 10 resumes per run with step-by-step results and timing.
  - **Function Calling:** Uses 6 specialized tools with state management for reliable sequential execution.
- **Custom Scoring Rubric:**
  - Define weighted evaluation criteria per job (e.g., "Python experience: 20%", "Leadership: 15%") with validation that weights sum to 100.
  - Ensures consistent, objective candidate evaluation standards across the team.
- **AI Governance & Analytics:**
  - **Comprehensive Logging:** Every AI API call is tracked with provider, model, feature, latency, token counts, cost, and success status across OpenAI, Claude, and Gemini.
  - **Analytics Dashboard:** Usage metrics by provider/feature/model, latency stats (average, P95), token consumption, daily trends, error tracking, and cost breakdowns over configurable time periods.
- **AI Voice Screening Calls (Vapi + Twilio):**
  - **Automated Candidate Calls:** Initiate AI-powered phone calls to candidates directly from the campaign dashboard to gather missing information (sponsorship status, availability, salary expectations, etc.).
  - **Customizable Questions:** Configure screening questions per call — choose from presets or add custom questions on the fly.
  - **Real-Time Call Status:** Live status tracking (queued, ringing, in-progress, completed) with automatic polling.
  - **AI-Generated Summaries:** Each call produces a transcript, structured extracted answers (key-value pairs), and an AI-generated summary.
  - **Call Log & History:** Full call history per candidate in a slide-out drawer with expandable details for each call — questions asked, answers extracted, transcript, duration, and cost.
  - **Powered by Vapi AI** for voice orchestration with Twilio telephony for reliable outbound calling.
- **Intelligent Background Processing & Concurrency:**
  - Parallelized/concurrent parsing for faster bulk uploads.
  - Automatic exponential backoff (retries up to 4 times) for OpenAI `429 Rate Limit`, `Quota Exceeded`, and `5xx Server` errors.
  - Automatic legacy path reconstruction to handle retries for candidates with missing storage paths.
- **Rich Candidate Directory & Compact View:**
  - Cleaned and compact table layout focused on essential contact and fit metrics.
  - **Quick Contact Copy Helper:** Interactive popup helper to easily copy a candidate's email and phone number with a single click.
  - Real-time multi-dimensional search (name, email, skills) and dynamic filters (location, minimum years of experience, visa status, work authorization, parsing status).
- **Candidate Detail Drawer:**
  - Slide-out panel for candidate interactions without leaving the candidate list.
  - Tabbed interface (Screening Call, Call Log) — extensible for future features (Notes, Emails, etc.).
- **Automated Email Notifications:**
  - Sends a consolidated summary email of parsing success/failure statistics, candidate scores, and direct dashboard links once all pending uploads for a specific job run are complete.
  - Integrates **Resend API** with a verified custom sender domain (`patternix.app`) to guarantee delivery. Fallback to **Nodemailer (SMTP)** is included.

---

## 🛠 Tech Stack

| Component              | Technology                                                            | Description                                                  |
| :--------------------- | :-------------------------------------------------------------------- | :----------------------------------------------------------- |
| **Frontend/Framework** | [Next.js 16 (App Router)](https://nextjs.org/)                        | Core application environment & routing API endpoints.        |
| **Styling**            | [TailwindCSS 4](https://tailwindcss.com/) & Vanilla CSS               | Premium dark-themed UI components and layouts.               |
| **Database & Auth**    | [Supabase Postgres + pgvector](https://supabase.com/)                 | Persistent storage, Auth, RLS policies, and vector search.   |
| **Storage**            | [Supabase Storage](https://supabase.com/docs/guides/storage)          | Resume file hosting under user-scoped structures.            |
| **AI Processing**      | [OpenAI GPT-4o-mini SDK](https://openai.com/)                         | Structured resume parsing, scoring, and agent orchestration. |
| **AI Analysis**        | [Anthropic Claude Sonnet 4](https://anthropic.com/)                   | Candidate comparison, copilot Q&A, and deep analysis.        |
| **Vector Embeddings**  | [OpenAI text-embedding-3-small](https://openai.com/)                  | Semantic search via 1536-dimensional resume embeddings.       |
| **Voice AI**           | [Vapi AI](https://vapi.ai/)                                           | AI voice agent for automated candidate screening calls.      |
| **Telephony**          | [Twilio](https://twilio.com/)                                         | Outbound phone number and call infrastructure via Vapi.      |
| **Mail Services**      | [Resend](https://resend.com/) & [Nodemailer](https://nodemailer.com/) | HTML notification dispatchers.                               |
| **Libraries**          | `pdf-parse`, `mammoth`, `jszip`                                       | Raw text extraction from PDFs, DOCXs, and ZIP files.         |

---

## 🔑 Environment Variables Setup

Create a `.env.local` file in the project root and populate it with the following configuration keys:

```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key # Required for background workers to bypass RLS

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key # Used for parsing, scoring, embeddings, and agent orchestration

# Anthropic Claude Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key # Used for candidate comparison, copilot, and analysis

# Vapi AI Configuration (Voice Screening Calls)
VAPI_API_KEY=your-vapi-private-api-key # Private key from Vapi dashboard
VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id # Phone number ID (import Twilio number into Vapi)

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

### 4. `voice_calls` Table

Stores AI voice screening call records, transcripts, and extracted answers.

- `id` (UUID, Primary Key)
- `owner_id` (UUID, references `auth.users`)
- `resume_id` (UUID, references `resumes.id`)
- `job_id` (UUID, Optional, references `jobs.id`)
- `vapi_call_id` (TEXT, unique Vapi call identifier)
- `candidate_name` / `candidate_phone` (TEXT)
- `status` (TEXT: `'queued'`, `'ringing'`, `'in-progress'`, `'ended'`, `'failed'`)
- `questions` (JSONB, array of screening questions asked)
- `answers` (JSONB, structured key-value answers extracted by AI)
- `transcript` (TEXT, full call transcript)
- `summary` (TEXT, AI-generated call summary)
- `call_duration_seconds` (INTEGER)
- `cost` (NUMERIC, call cost in USD)
- `ended_reason` (TEXT, e.g. `'assistant-ended-call'`, `'customer-ended-call'`)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### 5. `ai_logs` Table

Tracks all AI API calls for governance, cost analysis, and performance monitoring.

- `id` (UUID, Primary Key)
- `owner_id` (UUID, references `auth.users`)
- `provider` (TEXT: `'openai'`, `'claude'`, `'gemini'`)
- `model` (TEXT, e.g. `'gpt-4o-mini'`, `'claude-sonnet-4-20250514'`)
- `feature` (TEXT, e.g. `'parse'`, `'score'`, `'copilot'`, `'compare'`)
- `success` (BOOLEAN)
- `latency_ms` (INTEGER)
- `tokens_in` / `tokens_out` (INTEGER)
- `cost` (NUMERIC)
- `error` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)

### 6. `resume_embeddings` Table

Stores vector embeddings for semantic search using pgvector.

- `id` (UUID, Primary Key)
- `resume_id` (UUID, references `resumes.id`)
- `embedding` (VECTOR(1536), OpenAI embedding vector)
- `content` (TEXT, searchable text used to generate the embedding)
- `created_at` (TIMESTAMPTZ)

### 7. `scoring_rubrics` Table

Stores custom weighted scoring criteria per job.

- `id` (UUID, Primary Key)
- `job_id` (UUID, references `jobs.id`)
- `owner_id` (UUID, references `auth.users`)
- `criteria` (JSONB, array of `{ name, weight, description }`)
- `created_at` / `updated_at` (TIMESTAMPTZ)

### Custom ENUM Types

- `visa_status_enum` (Values: `'citizen'`, `'green_card'`, `'h1b'`, `'opt'`, `'stem_opt'`, `'cpt'`)
- `work_auth_enum` (Values: `'authorized'`, `'sponsorship'`)

---

## 🛠 Deep Dive: How the Core Integrations Work

### 🧬 OpenAI Integration ([lib/openai.ts](lib/openai.ts))

1. **Input Truncation:** Sanitizes text extraction, removing null characters and truncating the input to the first 20,000 characters to prevent token overflow.
2. **Strict JSON Mode:** Invokes `gpt-4o-mini` with `response_format: { type: "json_object" }` ensuring structured output matches our exact TS types.
3. **Robust Retry Engine:**
   - If OpenAI throws a **429 (Rate Limit / Quota)** or **5xx** error, the engine runs up to 4 retries with exponential backoff.
   - Handles content safety violations, network interruptions, and malformed JSON parses gracefully.

### 🤖 Dual-Mode Screening Mechanics

- **Campaign Encoding ([lib/campaign.ts](lib/campaign.ts)):**
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

### 📞 Vapi AI Voice Screening ([lib/vapi.ts](lib/vapi.ts))

1. **Dynamic Prompt Generation:** Each call generates a custom system prompt based on the candidate's name and the configured screening questions.
2. **Outbound Call Flow:**
   - User clicks "Call" on a candidate card → opens the Candidate Drawer.
   - Configures questions (preset or custom) → clicks "Start Screening Call".
   - API creates a Vapi call with an inline assistant (GPT-4o-mini + ElevenLabs voice).
   - Vapi calls the candidate via Twilio, asks questions conversationally, then auto-hangs up.
3. **Data Collection:**
   - **Webhook** (`/api/voice-call/webhook`): Vapi sends end-of-call report with transcript, summary, and structured data.
   - **Polling fallback** (`/api/voice-call/[id]`): If webhook is unreachable (e.g., local dev without ngrok), the client polls Vapi's API directly to sync call results.
4. **Analysis Plan:** Each call is configured with Vapi's analysis pipeline:
   - **Summary Plan:** Auto-generates a concise call summary.
   - **Structured Data Plan:** Extracts answers as key-value JSON from the transcript.
   - **Success Evaluation:** Pass/fail assessment of whether the call achieved its objectives.

### 🧠 Claude AI Integration ([lib/claude.ts](lib/claude.ts))

1. **Multi-Function Interface:** Exposes three core functions — `analyzeWithClaude()` for general analysis, `compareWithClaude()` for ranked candidate comparisons, and `copilotQuery()` for natural language Q&A.
2. **Candidate Comparison:** Accepts 2–5 candidates, analyzes them against job requirements, and returns ranked assessments with verdicts, risk factors, and hiring recommendations.
3. **AI Copilot:** Recruiters ask natural language questions about their pipeline; Claude responds with markdown-formatted, context-aware answers.

### 🔍 RAG Semantic Search ([lib/embeddings.ts](lib/embeddings.ts))

1. **Embedding Generation:** Converts parsed resume JSON (skills, experience, education, projects) into searchable text via `buildEmbeddingText()`, then generates 1536-dimensional vectors using OpenAI `text-embedding-3-small`.
2. **Vector Storage:** Embeddings are stored in Supabase using the `pgvector` extension for efficient cosine similarity search.
3. **Query Flow:** Search queries are embedded at request time and matched against stored resume vectors via a PostgreSQL RPC function, returning ranked candidates with similarity scores.

### 🤖 Agentic Workflow ([lib/agent-workflow.ts](lib/agent-workflow.ts))

1. **Autonomous Pipeline:** An LLM agent (GPT-4o-mini with function calling) orchestrates 6 tools in sequence: parse resume, score candidate, generate screening questions, embed for search, decide pipeline stage, and draft outreach email.
2. **State Management:** Each step's output feeds into the next via a shared state object, enabling context-aware decisions (e.g., pipeline stage is based on the score).
3. **Batch Execution:** The `/api/agent-workflow` endpoint processes up to 10 resumes per run, returning step-by-step results with timing for each.

### ✉️ Resend & Mail Integration ([lib/mail.ts](lib/mail.ts))

1. **Custom Domain Dispatch:** Deliveries use the verified sender address (`notifications@patternix.app`) to ensure bypass of sandbox limitations.
2. **Consolidation Check (`checkAndSendJobNotification`):**
   - Triggered immediately after background parsing updates a candidate's status to `'scored'` or `'error'`.
   - Queries `resumes` database: If any resume for the job is still in status `'uploaded'`, it cancels the notification email.
   - Once all files are processed, a single aggregated email listing success rates, failure flags, and individual scores is compiled and delivered.
   - Updates the `parsed_json.notified` flag to `true` for all successfully notified resumes to prevent duplicate emails.

### 📂 Supabase Client & Storage Integration

- Client initialization is split between ``lib/supabase/browser.ts`` (client-side cookies) and ``lib/supabase/server.ts`` (Next.js server environment).
- During background parsing, the system instantiates a `@supabase/supabase-js` administration client using the `SUPABASE_SERVICE_ROLE_KEY` to bypass standard RLS restrictions.

---

## 🏃‍♂️ Running Locally

1. **Clone the repository and install dependencies:**

   ```bash
   git clone https://github.com/ichandan2151/resume-ats.git
   cd resume-ats
   npm install
   ```

2. **Configure Supabase:**
   Create the necessary tables (`profiles`, `jobs`, `resumes`, `voice_calls`, `ai_logs`, `resume_embeddings`, `scoring_rubrics`) in your Supabase database instance. Run the migrations in `supabase/migrations/`.

3. **Set up API keys:**
   - Add `OPENAI_API_KEY` for resume parsing, scoring, embeddings, and agent workflows.
   - Add `ANTHROPIC_API_KEY` for Claude-powered candidate comparison, copilot, and analysis.
   - Create a [Vapi](https://vapi.ai) account and add `VAPI_API_KEY` and `VAPI_PHONE_NUMBER_ID` for voice screening.

4. **For local webhook testing (optional):**
   ```bash
   npx ngrok http 3000
   ```
   Set `NEXT_PUBLIC_APP_URL` to the ngrok URL in `.env.local`.

5. **Run the development server:**

   ```bash
   npm run dev
   ```
