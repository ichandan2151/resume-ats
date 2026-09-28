import OpenAI from "openai";
import { SupabaseClient } from "@supabase/supabase-js";
import { parseResumeWithOpenAI } from "./openai";
import { generateEmbedding, buildEmbeddingText } from "./embeddings";
import { logAICall } from "./ai-logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Tool definitions for the orchestrator agent
const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "parse_resume",
      description: "Parse a resume text to extract structured candidate data",
      parameters: {
        type: "object",
        properties: {
          resumeId: { type: "string", description: "The resume ID to parse" },
        },
        required: ["resumeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "score_candidate",
      description: "Score a candidate against the job requirements (0-100)",
      parameters: {
        type: "object",
        properties: {
          resumeId: { type: "string", description: "The resume ID to score" },
        },
        required: ["resumeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_screening_questions",
      description: "Generate personalized screening questions for a candidate",
      parameters: {
        type: "object",
        properties: {
          resumeId: { type: "string", description: "The resume ID" },
        },
        required: ["resumeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "decide_pipeline_stage",
      description: "Decide which pipeline stage a candidate should be placed in based on their score and profile",
      parameters: {
        type: "object",
        properties: {
          resumeId: { type: "string", description: "The resume ID" },
          stage: {
            type: "string",
            enum: ["new", "screening", "interview", "rejected"],
            description: "The recommended pipeline stage",
          },
          reasoning: { type: "string", description: "Why this stage was chosen" },
        },
        required: ["resumeId", "stage", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft an email to the candidate based on their pipeline stage",
      parameters: {
        type: "object",
        properties: {
          resumeId: { type: "string", description: "The resume ID" },
          emailType: {
            type: "string",
            enum: ["screening_invite", "interview_invite", "rejection", "followup"],
            description: "Type of email to draft",
          },
        },
        required: ["resumeId", "emailType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_embedding",
      description: "Generate and store vector embedding for semantic search",
      parameters: {
        type: "object",
        properties: {
          resumeId: { type: "string", description: "The resume ID" },
        },
        required: ["resumeId"],
      },
    },
  },
];

export type WorkflowStep = {
  tool: string;
  input: any;
  output: any;
  status: "success" | "error";
  durationMs: number;
};

export type WorkflowResult = {
  steps: WorkflowStep[];
  summary: string;
  totalDurationMs: number;
};

// Execute the agentic workflow for a resume
export async function runAgentWorkflow(
  supabase: SupabaseClient,
  serviceSupabase: SupabaseClient,
  ownerId: string,
  resumeId: string,
  jobId: string,
  jobDescription: string,
  jobTitle: string
): Promise<WorkflowResult> {
  const steps: WorkflowStep[] = [];
  const workflowStart = Date.now();

  // State that tools can read/write
  const state: Record<string, any> = {};

  // Fetch resume data
  const { data: resume } = await supabase
    .from("resumes")
    .select("id, extracted_text, parsed_json, score, full_name, email")
    .eq("id", resumeId)
    .single();

  if (!resume) {
    return { steps: [], summary: "Resume not found", totalDurationMs: 0 };
  }

  state.resume = resume;

  // Tool execution functions
  async function executeTool(
    name: string,
    args: any
  ): Promise<{ result: any; error?: string }> {
    const r = state.resume;
    switch (name) {
      case "parse_resume": {
        if (r.parsed_json && r.parsed_json.full_name) {
          return { result: { alreadyParsed: true, data: r.parsed_json } };
        }
        const parseResult = await parseResumeWithOpenAI(
          r.extracted_text || "",
          jobDescription
        );
        if (parseResult.success) {
          await serviceSupabase
            .from("resumes")
            .update({
              parsed_json: parseResult.data,
              full_name: parseResult.data.full_name,
              email: parseResult.data.email,
              score: parseResult.data.scoring?.score || null,
              score_breakdown: parseResult.data.scoring?.breakdown || null,
              status: "done",
            })
            .eq("id", resumeId);
          state.resume.parsed_json = parseResult.data;
          state.resume.score = parseResult.data.scoring?.score;
          return { result: parseResult.data };
        }
        return { result: null, error: parseResult.message };
      }

      case "score_candidate": {
        const parsed = state.resume.parsed_json;
        if (!parsed) return { result: null, error: "Resume not parsed yet" };
        const score = parsed.scoring?.score ?? state.resume.score ?? 0;
        return {
          result: {
            score,
            breakdown: parsed.scoring?.breakdown || null,
            skills: parsed.skills || [],
            yearsExperience: parsed.years_experience || 0,
          },
        };
      }

      case "generate_screening_questions": {
        const parsed = state.resume.parsed_json;
        if (!parsed) return { result: null, error: "Resume not parsed yet" };

        const qStart = Date.now();
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Generate 5 targeted screening questions for this candidate based on their resume and the job. Return JSON: { questions: string[], reasoning: string[] }",
            },
            {
              role: "user",
              content: `Resume: ${JSON.stringify(parsed)}\nJob: ${jobTitle} - ${jobDescription}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        });

        const qDuration = Date.now() - qStart;
        await logAICall(supabase, {
          owner_id: ownerId,
          provider: "openai",
          model: "gpt-4o-mini",
          feature: "agent-questions",
          success: true,
          latency_ms: qDuration,
        });

        const text = response.choices[0]?.message?.content || "{}";
        return { result: JSON.parse(text) };
      }

      case "decide_pipeline_stage": {
        const { stage, reasoning } = args;
        await serviceSupabase.from("candidate_stages").upsert(
          {
            owner_id: ownerId,
            resume_id: resumeId,
            job_id: jobId,
            stage,
            moved_at: new Date().toISOString(),
            moved_by: ownerId,
          },
          { onConflict: "resume_id,job_id" }
        );
        return { result: { stage, reasoning } };
      }

      case "draft_email": {
        const { emailType } = args;
        const candidateName = state.resume.parsed_json?.full_name || state.resume.full_name || "Candidate";

        const eStart = Date.now();
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Draft a professional recruiting email. Type: ${emailType}. Be warm, professional, and concise. Return JSON: { subject: string, body: string }`,
            },
            {
              role: "user",
              content: `Candidate: ${candidateName}\nRole: ${jobTitle}\nScore: ${state.resume.score || "N/A"}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
        });
        const eDuration = Date.now() - eStart;
        await logAICall(supabase, {
          owner_id: ownerId,
          provider: "openai",
          model: "gpt-4o-mini",
          feature: "agent-email-draft",
          success: true,
          latency_ms: eDuration,
        });

        const text = response.choices[0]?.message?.content || "{}";
        const emailDraft = JSON.parse(text);

        // Save draft as email template so the user can find and send it later
        await serviceSupabase.from("email_templates").insert({
          owner_id: ownerId,
          name: `[Auto] ${emailType} — ${candidateName}`,
          subject: emailDraft.subject || "",
          body: emailDraft.body || "",
          category: emailType,
        });

        return { result: emailDraft };
      }

      case "generate_embedding": {
        const parsed = state.resume.parsed_json;
        if (!parsed) return { result: null, error: "Resume not parsed yet" };

        const contentText = buildEmbeddingText(parsed);
        const embResult = await generateEmbedding(contentText);
        if (!embResult.success) return { result: null, error: embResult.error };

        await serviceSupabase.from("resume_embeddings").upsert(
          {
            owner_id: ownerId,
            resume_id: resumeId,
            job_id: jobId,
            content_text: contentText,
            embedding: JSON.stringify(embResult.embedding),
          },
          { onConflict: "resume_id" }
        );

        return { result: { embedded: true } };
      }

      default:
        return { result: null, error: `Unknown tool: ${name}` };
    }
  }

  // Orchestrator: Let the LLM decide the workflow
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are an AI recruiting workflow orchestrator. You process candidates through a hiring pipeline automatically.

For the given resume, execute the optimal sequence of steps:
1. Parse the resume (if not already parsed)
2. Review the score
3. Generate screening questions
4. Generate an embedding for semantic search
5. Decide pipeline stage based on score: >=70 → "interview", >=40 → "screening", <40 → "rejected"
6. Draft an appropriate email based on the stage

Execute all steps in order. Call each tool one at a time. After all tools are called, provide a final summary.`,
    },
    {
      role: "user",
      content: `Process this candidate:
Resume ID: ${resumeId}
Job: ${jobTitle}
${resume.parsed_json ? `Already parsed: Yes (Score: ${resume.score || "N/A"})` : "Already parsed: No"}
${resume.extracted_text ? `Resume text available: Yes (${resume.extracted_text.length} chars)` : "Resume text: Not available"}`,
    },
  ];

  // Agent loop: let the LLM call tools iteratively
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;

    const orchStart = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: AGENT_TOOLS,
      tool_choice: iterations <= 6 ? "auto" : "none",
    });
    const orchDuration = Date.now() - orchStart;

    await logAICall(supabase, {
      owner_id: ownerId,
      provider: "openai",
      model: "gpt-4o-mini",
      feature: "agent-orchestrator",
      input_summary: `Iteration ${iterations}`,
      success: true,
      latency_ms: orchDuration,
    });

    const choice = response.choices[0];
    const msg = choice.message;
    messages.push(msg);

    // If no tool calls, the agent is done
    if (!msg.tool_calls?.length) {
      const totalDuration = Date.now() - workflowStart;
      return {
        steps,
        summary: msg.content || "Workflow completed",
        totalDurationMs: totalDuration,
      };
    }

    // Execute each tool call
    for (const toolCall of msg.tool_calls) {
      const tc = toolCall as any;
      const toolName = tc.function.name;
      const toolArgs = JSON.parse(tc.function.arguments || "{}");

      const toolStart = Date.now();
      const { result, error } = await executeTool(toolName, toolArgs);
      const toolDuration = Date.now() - toolStart;

      steps.push({
        tool: toolName,
        input: toolArgs,
        output: error || result,
        status: error ? "error" : "success",
        durationMs: toolDuration,
      });

      // Feed result back to the agent
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(error ? { error } : result),
      });
    }
  }

  const totalDuration = Date.now() - workflowStart;
  return {
    steps,
    summary: "Workflow completed (max iterations reached)",
    totalDurationMs: totalDuration,
  };
}
