import {
  action,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { callOpenAIJSON } from "../lib/openai";
import {
  buildFallbackFinalPrompt,
  normalizeIntakeModelResult,
} from "../lib/intake-normalize";

const MAX_QUESTION_ROUNDS = 1;

const INTAKE_SYSTEM_PROMPT = `You shape rough Arbor marketplace tasks before specialist agents bid.

Return JSON only.

If the task is missing details that would materially change specialist routing or execution, return:
{ "status": "questions", "questions": ["...", "..."] }

If the task is ready for specialists, return:
{ "status": "ready", "final_prompt": "..." }

Rules:
- Ask at most 3 questions.
- Ask only questions whose answers change execution.
- Do not ask for secrets, API keys, private credentials, or payment details.
- The final_prompt must preserve the user's goal, constraints, budget-sensitive expectations, success criteria, known context, and unknowns.
- The final_prompt should be directly usable by Arbor's existing post_task pipeline.`;

function cleanRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  return trimmed;
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildModelPrompt(args: {
  intake: Doc<"task_intakes">;
  messages: Doc<"task_intake_messages">[];
  forceFinal: boolean;
}) {
  const answers = args.messages
    .filter((message) => message.kind === "answer")
    .map((message) => message.text);
  const questions = args.messages
    .filter((message) => message.kind === "questions")
    .flatMap((message) => message.questions ?? []);

  return [
    `Initial task:\n${args.intake.initial_prompt}`,
    `Task type: ${args.intake.task_type}`,
    `Max budget: $${args.intake.max_budget.toFixed(2)}`,
    args.forceFinal
      ? "You have reached the question limit. Return a ready final_prompt now."
      : "You may ask one more short clarification round only if it materially improves execution.",
    questions.length > 0
      ? `Questions already asked:\n${questions.map((q, index) => `${index + 1}. ${q}`).join("\n")}`
      : "Questions already asked: none",
    answers.length > 0
      ? `User answers:\n${answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n\n")}`
      : "User answers: none",
  ].join("\n\n");
}

async function generateAndRecord(
  ctx: ActionCtx,
  intake_id: Id<"task_intakes">,
) {
  const intake: Doc<"task_intakes"> = await ctx.runQuery(internal.intake._get, {
    intake_id,
  });
  const messages: Doc<"task_intake_messages">[] = await ctx.runQuery(
    internal.intake._messagesForIntake,
    { intake_id },
  );
  const answers = messages
    .filter((message) => message.kind === "answer")
    .map((message) => message.text);
  const forceFinal = intake.question_rounds >= MAX_QUESTION_ROUNDS;

  try {
    const raw = await callOpenAIJSON<unknown>({
      systemPrompt: INTAKE_SYSTEM_PROMPT,
      userPrompt: buildModelPrompt({ intake, messages, forceFinal }),
      maxTokens: 1200,
      timeoutMs: 25_000,
      retries: 0,
    });
    const normalized = normalizeIntakeModelResult(raw);
    if (!normalized) {
      throw new Error("Intake model returned malformed JSON.");
    }

    if (normalized.status === "questions" && !forceFinal) {
      const question_rounds = intake.question_rounds + 1;
      await ctx.runMutation(internal.intake._recordQuestions, {
        intake_id,
        questions: normalized.questions,
        question_rounds,
      });
      return {
        intake_id,
        status: "collecting" as const,
        questions: normalized.questions,
        final_prompt: null,
      };
    }

    const final_prompt =
      normalized.status === "ready"
        ? normalized.final_prompt
        : buildFallbackFinalPrompt(intake.initial_prompt, answers);
    await ctx.runMutation(internal.intake._recordFinalBrief, {
      intake_id,
      final_prompt,
    });
    return {
      intake_id,
      status: "ready" as const,
      questions: [],
      final_prompt,
    };
  } catch (error) {
    const final_prompt = buildFallbackFinalPrompt(intake.initial_prompt, answers);
    await ctx.runMutation(internal.intake._recordFinalBrief, {
      intake_id,
      final_prompt,
      last_error: errorMessage(error),
    });
    return {
      intake_id,
      status: "ready" as const,
      questions: [],
      final_prompt,
      last_error: errorMessage(error),
    };
  }
}

export const start = action({
  args: {
    owner_id: v.string(),
    prompt: v.string(),
    max_budget: v.number(),
    task_type: v.optional(v.string()),
    output_schema: v.optional(v.any()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const initial_prompt = cleanRequired(args.prompt, "Prompt");
    if (!Number.isFinite(args.max_budget) || args.max_budget <= 0) {
      throw new Error("Budget must be greater than zero.");
    }
    const intake_id: Id<"task_intakes"> = await ctx.runMutation(
      internal.intake._create,
      {
        owner_id: cleanRequired(args.owner_id, "Owner"),
        initial_prompt,
        task_type: cleanOptional(args.task_type) ?? "general",
        max_budget: args.max_budget,
        output_schema: args.output_schema,
        business_context: cleanOptional(args.business_context),
        repo_context: cleanOptional(args.repo_context),
        source_hints: args.source_hints,
      },
    );
    return await generateAndRecord(ctx, intake_id);
  },
});

export const answer = action({
  args: {
    intake_id: v.id("task_intakes"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const answerText = cleanRequired(args.answer, "Answer");
    const intake: Doc<"task_intakes"> = await ctx.runQuery(internal.intake._get, {
      intake_id: args.intake_id,
    });
    if (intake.status !== "collecting") {
      throw new Error("This intake is not waiting for clarification.");
    }
    await ctx.runMutation(internal.intake._recordAnswer, {
      intake_id: args.intake_id,
      answer: answerText,
    });
    return await generateAndRecord(ctx, args.intake_id);
  },
});

export const approveAndPost = action({
  args: {
    intake_id: v.id("task_intakes"),
    final_prompt: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { task_id: Id<"tasks">; already_posted: true }
    | {
        task_id: Id<"tasks">;
        status: "planning";
        bid_window_closes_at: number;
      }
  > => {
    const final_prompt = cleanRequired(args.final_prompt, "Final brief");
    const claim: { kind: "claimed" } | { kind: "busy" } | {
      kind: "posted";
      task_id: Id<"tasks">;
    } = await ctx.runMutation(internal.intake._claimForPosting, {
      intake_id: args.intake_id,
      final_prompt,
    });

    if (claim.kind === "posted") {
      return { task_id: claim.task_id, already_posted: true };
    }
    if (claim.kind === "busy") {
      throw new Error("This intake is already being posted.");
    }

    const intake: Doc<"task_intakes"> = await ctx.runQuery(internal.intake._get, {
      intake_id: args.intake_id,
    });

    const postArgs: {
      posted_by: string;
      task_type: string;
      prompt: string;
      max_budget: number;
      output_schema?: unknown;
      business_context?: string;
      repo_context?: string;
      source_hints?: string[];
    } = {
      posted_by: intake.owner_id,
      task_type: intake.task_type,
      prompt: final_prompt,
      max_budget: intake.max_budget,
    };
    if (intake.output_schema !== undefined) {
      postArgs.output_schema = intake.output_schema;
    }
    if (intake.business_context) {
      postArgs.business_context = intake.business_context;
    }
    if (intake.repo_context) {
      postArgs.repo_context = intake.repo_context;
    }
    if (intake.source_hints) {
      postArgs.source_hints = intake.source_hints;
    }

    try {
      const result: {
        task_id: Id<"tasks">;
        status: "planning";
        bid_window_closes_at: number;
      } = await ctx.runMutation(api.tasks.post, postArgs);
      await ctx.runMutation(internal.intake._markPosted, {
        intake_id: args.intake_id,
        task_id: result.task_id,
        final_prompt,
      });
      return {
        task_id: result.task_id,
        status: result.status,
        bid_window_closes_at: result.bid_window_closes_at,
      };
    } catch (error) {
      await ctx.runMutation(internal.intake._markFailed, {
        intake_id: args.intake_id,
        last_error: errorMessage(error),
      });
      throw error;
    }
  },
});

export const get = query({
  args: { intake_id: v.id("task_intakes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.intake_id);
  },
});

export const messages = query({
  args: { intake_id: v.id("task_intakes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("task_intake_messages")
      .withIndex("by_intake_id", (q) => q.eq("intake_id", args.intake_id))
      .order("asc")
      .take(50);
  },
});

export const _get = internalQuery({
  args: { intake_id: v.id("task_intakes") },
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intake_id);
    if (!intake) throw new Error(`intake ${args.intake_id} not found`);
    return intake;
  },
});

export const _messagesForIntake = internalQuery({
  args: { intake_id: v.id("task_intakes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("task_intake_messages")
      .withIndex("by_intake_id", (q) => q.eq("intake_id", args.intake_id))
      .order("asc")
      .take(50);
  },
});

export const _create = internalMutation({
  args: {
    owner_id: v.string(),
    initial_prompt: v.string(),
    task_type: v.string(),
    max_budget: v.number(),
    output_schema: v.optional(v.any()),
    business_context: v.optional(v.string()),
    repo_context: v.optional(v.string()),
    source_hints: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const intake_id = await ctx.db.insert("task_intakes", {
      owner_id: args.owner_id,
      initial_prompt: args.initial_prompt,
      task_type: args.task_type,
      max_budget: args.max_budget,
      status: "collecting",
      question_rounds: 0,
      created_at: now,
      updated_at: now,
      ...(args.output_schema !== undefined ? { output_schema: args.output_schema } : {}),
      ...(args.business_context ? { business_context: args.business_context } : {}),
      ...(args.repo_context ? { repo_context: args.repo_context } : {}),
      ...(args.source_hints ? { source_hints: args.source_hints } : {}),
    });
    await ctx.db.insert("task_intake_messages", {
      intake_id,
      role: "user",
      kind: "initial_prompt",
      text: args.initial_prompt,
      created_at: now,
    });
    return intake_id;
  },
});

export const _recordQuestions = internalMutation({
  args: {
    intake_id: v.id("task_intakes"),
    questions: v.array(v.string()),
    question_rounds: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.intake_id, {
      status: "collecting",
      question_rounds: args.question_rounds,
      updated_at: now,
    });
    await ctx.db.insert("task_intake_messages", {
      intake_id: args.intake_id,
      role: "assistant",
      kind: "questions",
      text: args.questions.join("\n"),
      questions: args.questions,
      created_at: now,
    });
  },
});

export const _recordAnswer = internalMutation({
  args: {
    intake_id: v.id("task_intakes"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("task_intake_messages", {
      intake_id: args.intake_id,
      role: "user",
      kind: "answer",
      text: args.answer,
      created_at: Date.now(),
    });
  },
});

export const _recordFinalBrief = internalMutation({
  args: {
    intake_id: v.id("task_intakes"),
    final_prompt: v.string(),
    last_error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.intake_id, {
      status: "ready",
      final_prompt: args.final_prompt,
      updated_at: now,
      ...(args.last_error ? { last_error: args.last_error } : {}),
    });
    if (args.last_error) {
      await ctx.db.insert("task_intake_messages", {
        intake_id: args.intake_id,
        role: "system",
        kind: "error",
        text: `Automatic intake failed: ${args.last_error}`,
        created_at: now,
      });
    }
    await ctx.db.insert("task_intake_messages", {
      intake_id: args.intake_id,
      role: "assistant",
      kind: "final_brief",
      text: args.final_prompt,
      created_at: now,
    });
  },
});

export const _claimForPosting = internalMutation({
  args: {
    intake_id: v.id("task_intakes"),
    final_prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const intake = await ctx.db.get(args.intake_id);
    if (!intake) throw new Error(`intake ${args.intake_id} not found`);
    if (intake.posted_task_id) {
      return { kind: "posted" as const, task_id: intake.posted_task_id };
    }
    if (intake.status === "posting") {
      return { kind: "busy" as const };
    }
    if (intake.status !== "ready" && intake.status !== "failed") {
      throw new Error("This intake is not ready to post.");
    }
    await ctx.db.patch(args.intake_id, {
      status: "posting",
      final_prompt: args.final_prompt,
      updated_at: Date.now(),
    });
    return { kind: "claimed" as const };
  },
});

export const _markPosted = internalMutation({
  args: {
    intake_id: v.id("task_intakes"),
    task_id: v.id("tasks"),
    final_prompt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.intake_id, {
      status: "posted",
      posted_task_id: args.task_id,
      final_prompt: args.final_prompt,
      updated_at: Date.now(),
    });
  },
});

export const _markFailed = internalMutation({
  args: {
    intake_id: v.id("task_intakes"),
    last_error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.intake_id, {
      status: "failed",
      last_error: args.last_error,
      updated_at: Date.now(),
    });
  },
});
