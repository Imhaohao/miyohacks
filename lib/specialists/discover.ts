/**
 * Synthesize a brand-new specialist agent on demand. Used when no existing
 * specialist scores well enough against a user query — the marketplace
 * "spawns" a tailor-made agent rather than failing.
 *
 * Discovered specialists run as in-persona LLM agents (no MCP endpoint).
 * They can later be promoted to MCP-forwarding by editing the persisted
 * record and adding `mcp_endpoint`.
 */

import { callOpenAIJSON } from "../openai";
import type { SpecialistConfig } from "../types";

interface DiscoverArgs {
  query: string;
  taskType?: string;
  /** Existing specialists, used so the LLM avoids duplicating roles. */
  existing: SpecialistConfig[];
}

interface DiscoverLLMResponse {
  agent_id?: string;
  display_name?: string;
  sponsor?: string;
  one_liner?: string;
  capabilities?: string[];
  system_prompt?: string;
  cost_baseline?: number;
}

const DISCOVER_SYSTEM_PROMPT = `You design specialist AI agents for an autonomous creator-marketing marketplace. The user describes work the existing roster cannot cover well; you invent a new specialist tailored to that gap.

Constraints:
- agent_id: lowercase kebab-case, 3-40 chars, descriptive (e.g. "tiktok-shop-launcher").
- display_name: same as agent_id is fine.
- sponsor: a plausible product/team name in the social-commerce / creator space. Mark synthetic by suffixing " (synthesized)".
- capabilities: 3-6 short verb-noun strings.
- one_liner: <=120 chars, plain language, no marketing fluff.
- system_prompt: 2-4 sentences, second person, sets the agent's persona, expertise, and how it should ground its output (Reacher TikTok Shop evidence + Nia-backed context where relevant).
- cost_baseline: number 0.30-1.20 reflecting expected work volume.

Do not duplicate an existing agent's primary capability. Output JSON only.`;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,40}$/;

function uniqueAgentId(base: string, taken: Set<string>): string {
  let id = base;
  let i = 2;
  while (taken.has(id)) {
    id = `${base}-${i}`;
    i += 1;
    if (i > 50) {
      id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      break;
    }
  }
  return id;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function discoverSpecialist(
  args: DiscoverArgs,
): Promise<SpecialistConfig> {
  const userPrompt = [
    `User goal:\n${args.query.trim()}`,
    args.taskType ? `Workflow hint: ${args.taskType}` : null,
    "Existing specialists (do not duplicate):",
    args.existing
      .map(
        (s) =>
          `- ${s.agent_id} (${s.sponsor}): ${s.one_liner} [${s.capabilities.join(", ")}]`,
      )
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: DiscoverLLMResponse;
  try {
    raw = await callOpenAIJSON<DiscoverLLMResponse>({
      systemPrompt: DISCOVER_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 700,
      timeoutMs: 18_000,
      retries: 0,
    });
  } catch (err) {
    raw = {};
    // fall through to local synthesis below
    void err;
  }

  const taken = new Set(args.existing.map((s) => s.agent_id));
  const fallbackBase = slugify(args.query.split(/\s+/).slice(0, 4).join(" ")) || "specialist";

  const candidateId = raw.agent_id && ID_PATTERN.test(raw.agent_id) ? raw.agent_id : fallbackBase;
  const agent_id = uniqueAgentId(candidateId, taken);

  const capabilities = Array.isArray(raw.capabilities) && raw.capabilities.length > 0
    ? raw.capabilities
        .map((c) => String(c).trim())
        .filter((c) => c.length > 0 && c.length < 80)
        .slice(0, 6)
    : ["custom-workflow", "campaign-execution"];

  const cfg: SpecialistConfig = {
    agent_id,
    display_name: typeof raw.display_name === "string" && raw.display_name.trim() ? raw.display_name.trim() : agent_id,
    sponsor:
      typeof raw.sponsor === "string" && raw.sponsor.trim()
        ? raw.sponsor.trim()
        : "Discovery (synthesized)",
    capabilities,
    cost_baseline: clampCost(raw.cost_baseline),
    starting_reputation: 0.5,
    one_liner:
      typeof raw.one_liner === "string" && raw.one_liner.trim()
        ? raw.one_liner.trim().slice(0, 200)
        : `Synthesized specialist for: ${args.query.trim().slice(0, 80)}`,
    system_prompt:
      typeof raw.system_prompt === "string" && raw.system_prompt.trim()
        ? raw.system_prompt.trim()
        : `You are ${agent_id}, a specialist agent synthesized to handle the goal: "${args.query.trim()}". Ground your output in Reacher TikTok Shop evidence and Nia context where applicable. Be specific, structured, and honest about uncertainty.`,
    discovered: true,
    discovered_for: args.query.trim().slice(0, 240),
  };

  return cfg;
}

function clampCost(n: unknown): number {
  const num = typeof n === "number" && Number.isFinite(n) ? n : 0.55;
  return Math.max(0.3, Math.min(1.2, Number(num.toFixed(2))));
}
