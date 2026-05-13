// Specialist: hyperspell-brain (powered by the real Hyperspell Memory API).
// It does not pretend to be an implementation agent: it searches/updates
// Hyperspell memory and returns context evidence for downstream specialists.

import { addMemory, searchMemories } from "../hyperspell";
import { isImplementationTask } from "../campaign-context";
import type {
  BidPayload,
  DeclineDecision,
  SpecialistConfig,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

export const HYPERSPELL_BRAIN_CONFIG: SpecialistConfig = {
  agent_id: "hyperspell-brain",
  display_name: "hyperspell-brain",
  sponsor: "Hyperspell",
  agent_role: "executive",
  capabilities: [
    "business-context-synthesis",
    "workspace-synthesis",
    "customer-persona-matching",
    "requirements-clarification",
  ],
  cost_baseline: 0.40,
  starting_reputation: 0.6,
  one_liner: "Synthesizes business goals, customer context, workspace notes, and requirements before execution.",
  system_prompt: `You are hyperspell-brain, a specialist agent powered by Hyperspell. Your strength is synthesizing scattered business context: who the company is, what the team knows, what users want, CRM/workspace learnings, positioning, and constraints. Use that context to clarify requirements and prevent execution agents from losing intent. If the task includes a GitHub URL, owner/repo, repo source hint, or implementation request, explicitly coordinate with the Nia/GitHub context layer: ask for the repository to be indexed through GitHub and for README.md or the repository README to be read first. Use README-derived product purpose, setup, architecture, and constraints as bootstrap context before asking the user for anything else, and ask only for private business details that GitHub/README cannot answer. Do not pivot unrelated tasks into creator campaigns.`,
  mcp_api_key_env: "HYPERSPELL_API_KEY",
  is_verified: Boolean(process.env.HYPERSPELL_API_KEY),
  homepage_url: "https://hyperspell.com",
};

function hyperspellKey() {
  return process.env.HYPERSPELL_API_KEY?.trim();
}

function isContextTask(prompt: string, taskType: string) {
  const text = `${prompt} ${taskType}`.toLowerCase();
  return [
    "context",
    "memory",
    "hyperspell",
    "requirements",
    "brief",
    "positioning",
    "customer",
    "persona",
    "workspace",
    "research what we know",
    "what do we know",
  ].some((needle) => text.includes(needle));
}

function userIdForTask() {
  return process.env.HYPERSPELL_USER_ID?.trim() || "agent:hyperspell-brain";
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

function formatDocument(doc: {
  source: string;
  resource_id: string;
  title?: string | null;
  score?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const score =
    typeof doc.score === "number" && Number.isFinite(doc.score)
      ? ` · score ${doc.score.toFixed(2)}`
      : "";
  const title = doc.title?.trim() || doc.resource_id;
  const url =
    typeof doc.metadata?.url === "string" ? `\n  ${doc.metadata.url}` : "";
  return `- ${title} (${doc.source}:${doc.resource_id}${score})${url}`;
}

export const hyperspellBrain: SpecialistRunner = {
  config: HYPERSPELL_BRAIN_CONFIG,

  async bid(prompt, taskType): Promise<BidPayload | DeclineDecision> {
    if (!hyperspellKey()) {
      return decline(
        "HYPERSPELL_API_KEY is not configured, so live Hyperspell memory search is unavailable.",
      );
    }
    if (isImplementationTask(prompt, taskType) && !isContextTask(prompt, taskType)) {
      return decline(
        "Hyperspell is a memory/context specialist, not a repo implementation executor. Route implementation work to a coding or repo specialist after context is gathered.",
      );
    }
    return {
      bid_price: HYPERSPELL_BRAIN_CONFIG.cost_baseline,
      capability_claim:
        "I will call Hyperspell's live memory API to retrieve relevant business/workspace context, add this task brief to memory, and return cited context for the executor.",
      estimated_seconds: 60,
      execution_preview:
        "Live Hyperspell run: /memories/query with answer=true, then /memories/add to persist the task brief.",
      tool_availability: {
        status: "available",
        checked: ["HYPERSPELL_API_KEY"],
        reason: "Hyperspell Memory API is configured",
      },
    };
  },

  async execute(prompt, taskType): Promise<SpecialistOutput> {
    if (!hyperspellKey()) {
      throw new Error("HYPERSPELL_API_KEY is not set");
    }
    const userId = userIdForTask();
    const query = [
      "Find the business, customer, workspace, and requirements context needed",
      "to answer or execute this Arbor task. Return concrete facts, constraints,",
      "open questions, and any relevant prior decisions.",
      "If GitHub or repo context exists in memory, prefer README-derived",
      "project purpose, setup, architecture, routes/packages, and constraints",
      "before asking the user to restate context by hand.",
      "",
      `Task type: ${taskType}`,
      `Task: ${prompt}`,
    ].join("\n");

    const result = await searchMemories({
      userId,
      query,
      answer: true,
      maxResults: 8,
      effort: "low",
    });

    await addMemory({
      userId,
      title: `Arbor specialist task: ${taskType}`,
      collection: "arbor_specialist_runs",
      text: [
        `Specialist: ${HYPERSPELL_BRAIN_CONFIG.agent_id}`,
        `Task type: ${taskType}`,
        `Run at: ${new Date().toISOString()}`,
        "",
        prompt,
      ].join("\n"),
      date: new Date().toISOString(),
      metadata: {
        source: "arbor_specialist_run",
        agent_id: HYPERSPELL_BRAIN_CONFIG.agent_id,
        task_type: taskType,
      },
    }).catch(() => undefined);

    const answer = result.answer?.trim();
    const docs = result.documents.slice(0, 8);
    return [
      "# Hyperspell memory execution result",
      "",
      `User scope: ${userId}`,
      `Query id: ${result.query_id ?? "not returned"}`,
      `Documents retrieved: ${docs.length}`,
      "",
      "## Memory answer",
      answer ||
        "Hyperspell returned no direct answer. Treat this as a signal that the user's product context needs to be seeded before execution.",
      "",
      "## Retrieved memory sources",
      docs.length ? docs.map(formatDocument).join("\n") : "No matching memory documents were returned.",
      result.errors?.length
        ? ["", "## Hyperspell debug errors", "```json", JSON.stringify(result.errors, null, 2), "```"].join("\n")
        : "",
      "",
      "## Executor handoff",
      "- Use the memory answer as business/workspace context only.",
      "- If the task has a GitHub repo or implementation surface, ensure Nia indexes the GitHub repository and reads the README before requesting manual context.",
      "- Do not treat Hyperspell memory as repo truth; pair it with Nia/source evidence before code changes.",
      "- Ask the user to seed company context only for private business details not recoverable from GitHub, README, or workspace memory.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};
