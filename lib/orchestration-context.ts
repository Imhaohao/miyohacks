import { isImplementationTask } from "./campaign-context";

export interface ContextInput {
  prompt: string;
  taskType: string;
  businessContext?: string;
  repoContext?: string;
  sourceHints?: string[];
}

export interface BusinessContext {
  owner: "hyperspell";
  summary: string;
  known_facts: string[];
  goals: string[];
  constraints: string[];
  open_questions: string[];
}

export interface RepoContext {
  owner: "nia";
  summary: string;
  source_map: Array<{ label: string; path: string; why: string }>;
  retrieval_queries: string[];
  guardrails: string[];
}

export interface RoutingContext {
  owner: "auction-house";
  execution_rule: string;
  recommended_specialists: string[];
  context_contract: string[];
}

export interface OrchestrationContext {
  version: "hyperspell-nia-auction-v1";
  business: BusinessContext;
  repo: RepoContext;
  routing: RoutingContext;
  prompt_addendum: string;
}

function cleanList(items: Array<string | undefined>): string[] {
  return items
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
}

function includesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

export function buildOrchestrationContext(input: ContextInput): OrchestrationContext {
  const sourceHints = input.sourceHints ?? [];
  const prompt = input.prompt.trim();
  const lower = prompt.toLowerCase();
  const isStartup = includesAny(lower, ["startup", "seed", "founder", "tiny growth team"]);
  const isRepo = isImplementationTask(prompt, input.taskType);

  const business: BusinessContext = {
    owner: "hyperspell",
    summary: input.businessContext?.trim() ||
      (isStartup
        ? "Seed-stage business with limited operator bandwidth that needs founder-ready execution, not generic advice."
        : "Business context should be inferred from the buyer's brief and treated as the current operating reality."),
    known_facts: cleanList([
      isStartup ? "Small team; output must be immediately usable by a founder or operator." : undefined,
      input.businessContext?.trim(),
    ]),
    goals: cleanList([
      isRepo
        ? "Plan the requested software/product change before execution, preserving existing repo behavior."
        : "Complete the requested workflow with evidence-backed execution.",
      "Minimize coordination loss when handing work to a specialized execution agent.",
    ]),
    constraints: cleanList([
      "Do not assume the executor knows hidden business context unless it is included in this packet.",
      "Keep outputs concrete enough for a human operator or downstream agent to act on.",
    ]),
    open_questions: cleanList([
      "What exact evidence did the executor use?",
      "Which assumptions should be verified before acting on the deliverable?",
    ]),
  };

  const repo: RepoContext = {
    owner: "nia",
    summary: input.repoContext?.trim() ||
      (isRepo
        ? "Nia should retrieve the relevant repo files, docs, APIs, state contracts, and source references before execution."
        : "Nia should treat the source layer as the authoritative map of docs, repo behavior, and reusable code patterns."),
    source_map: [
      ...sourceHints.map((hint, index) => ({
        label: `source_hint_${index + 1}`,
        path: hint,
        why: "Caller-provided source hint for Nia retrieval.",
      })),
      {
        label: "auction-lifecycle",
        path: "convex/auctions.ts",
        why: "Controls specialist bidding, execution, judging, settlement, and context injection.",
      },
      {
        label: "specialist-registry",
        path: "lib/specialists/registry.ts",
        why: "Defines which specialist agents can be invited by the auction house.",
      },
    ],
    retrieval_queries: cleanList([
      isRepo
        ? "Find files and docs that define the requested implementation path."
        : "Find source snippets and docs that constrain the requested workflow.",
      "Find prior context, helper APIs, and data contracts the executor must not invent.",
      "Find edge cases that could make the downstream execution fail.",
    ]),
    guardrails: cleanList([
      "Executor must cite repo/docs/source evidence when making implementation claims.",
      "Executor must not overwrite existing user changes or invent APIs that are not present.",
      "If Nia evidence is unavailable, executor must state that gap explicitly.",
    ]),
  };

  const recommended = isRepo
    ? [
        "nia-context",
        "devin-engineer",
        "codex-writer",
        "convex-realtime",
        "vercel-v0",
      ]
    : ["hyperspell-brain", "nia-context", "codex-writer", "devin-engineer"];

  const routing: RoutingContext = {
    owner: "auction-house",
    execution_rule: "Auction house routes execution only after Hyperspell business context and Nia repo/source context are attached to the task.",
    recommended_specialists: recommended,
    context_contract: [
      "Hyperspell owns business identity, internal knowledge, goals, and buyer intent.",
      "Nia owns repo, docs, source evidence, APIs, and implementation constraints.",
      "Auction house owns which specialist executes which part and scores bids using reputation and price.",
      "Execution agent must preserve both context layers in the final answer.",
    ],
  };

  const prompt_addendum = [
    "Context handoff packet:",
    "Hyperspell business context:",
    `- summary: ${business.summary}`,
    `- known facts: ${business.known_facts.join(" | ") || "none supplied"}`,
    `- goals: ${business.goals.join(" | ")}`,
    `- constraints: ${business.constraints.join(" | ")}`,
    "",
    "Nia repo/source context:",
    `- summary: ${repo.summary}`,
    `- source map: ${repo.source_map.map((source) => `${source.label}=${source.path}`).join(" | ")}`,
    `- retrieval queries: ${repo.retrieval_queries.join(" | ")}`,
    `- guardrails: ${repo.guardrails.join(" | ")}`,
    "",
    "Auction-house routing context:",
    `- execution rule: ${routing.execution_rule}`,
    `- context contract: ${routing.context_contract.join(" | ")}`,
  ].join("\n");

  return {
    version: "hyperspell-nia-auction-v1",
    business,
    repo,
    routing,
    prompt_addendum,
  };
}
