/**
 * Arbor sandbox A2A specialist runner.
 *
 * Used for catalog A2A contacts that have no live vendor endpoint configured.
 * Output is produced by Arbor's own LLM in the agent's persona and is
 * explicitly labelled as a sandbox adapter — never as a vendor-native call.
 *
 * Bid:    declines fast when the agent's domain does not fit the task, and
 *         otherwise returns a low-cost bid with a `sandbox: true` flag.
 * Execute: returns a structured JSON artifact plus a markdown summary that
 *         leads with the sandbox disclosure.
 */

import { callOpenAIJSON, callOpenAI } from "../openai";
import { buildTaskContext, isImplementationTask } from "../campaign-context";
import { implementationPlanFromText } from "../implementation-plan";
import { roleForSpecialist } from "../agent-roles";
import {
  SANDBOX_DISCLOSURE_TEXT,
  isSandboxA2AEnabled,
} from "../agent-execution-status";
import type {
  BidPayload,
  DeclineDecision,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

const SANDBOX_PRELUDE = `You are operating inside Arbor's sandbox A2A adapter. This means:
- No vendor endpoint is connected, so you cannot make real API calls into the sponsor's product.
- You may still produce real, useful work: a plan, a structured analysis, or a draft artifact.
- You MUST disclose at the top of any output: "${SANDBOX_DISCLOSURE_TEXT}"
- Do not invent vendor responses or pretend a remote system returned data.`;

interface SandboxBidLLMResponse {
  decline?: boolean;
  reason?: string;
  bid_price?: number;
  capability_claim?: string;
  estimated_seconds?: number;
}

export interface SandboxArtifact {
  kind: "sandbox_artifact";
  agent_id: string;
  display_name: string;
  sandbox_disclosure: string;
  title: string;
  summary: string;
  capabilities_used: string[];
  structured_findings: Array<{ label: string; value: string }>;
  recommended_actions: string[];
  risks: string[];
  /** Markdown rendering of the artifact, leading with the disclosure. */
  markdown: string;
}

interface SandboxArtifactLLMResponse {
  title?: string;
  summary?: string;
  capabilities_used?: string[];
  structured_findings?: Array<{ label?: string; value?: string }>;
  recommended_actions?: string[];
  risks?: string[];
}

function renderMarkdown(args: {
  config: SpecialistConfig;
  artifact: Omit<SandboxArtifact, "markdown" | "kind">;
}): string {
  const { artifact, config } = args;
  const lines = [
    `> ${artifact.sandbox_disclosure}`,
    "",
    `# ${artifact.title}`,
    "",
    artifact.summary,
    "",
    `**Agent persona:** ${config.display_name} (${config.sponsor})`,
    `**Execution mode:** Sandbox A2A adapter`,
    "",
  ];
  if (artifact.capabilities_used.length > 0) {
    lines.push("## Capabilities used", "");
    for (const capability of artifact.capabilities_used) {
      lines.push(`- ${capability}`);
    }
    lines.push("");
  }
  if (artifact.structured_findings.length > 0) {
    lines.push("## Findings", "");
    for (const finding of artifact.structured_findings) {
      lines.push(`- **${finding.label}**: ${finding.value}`);
    }
    lines.push("");
  }
  if (artifact.recommended_actions.length > 0) {
    lines.push("## Recommended next steps", "");
    for (const action of artifact.recommended_actions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }
  if (artifact.risks.length > 0) {
    lines.push("## Risks & caveats", "");
    for (const risk of artifact.risks) {
      lines.push(`- ${risk}`);
    }
  }
  return lines.join("\n").trim();
}

function fallbackArtifact(args: {
  config: SpecialistConfig;
  prompt: string;
}): SandboxArtifact {
  const { config, prompt } = args;
  const base = {
    agent_id: config.agent_id,
    display_name: config.display_name,
    sandbox_disclosure: SANDBOX_DISCLOSURE_TEXT,
    title: `${config.display_name} sandbox response`,
    summary: `${config.display_name} did not have a vendor endpoint connected; this is a sandbox-adapter draft of how it would approach the request.`,
    capabilities_used: config.capabilities.slice(0, 6),
    structured_findings: [
      {
        label: "Request",
        value: prompt.slice(0, 280),
      },
      {
        label: "Persona",
        value: `${config.display_name} — ${config.one_liner}`,
      },
    ],
    recommended_actions: [
      "Verify that a vendor A2A endpoint is configured before relying on this output.",
      "Use this artifact as a sketch for the kind of work the real agent would do.",
    ],
    risks: [
      "Output is sandbox-generated; do not treat it as a real vendor response.",
    ],
  };
  const markdown = renderMarkdown({ config, artifact: base });
  return { kind: "sandbox_artifact", markdown, ...base };
}

function normalizeArtifact(args: {
  config: SpecialistConfig;
  prompt: string;
  raw: SandboxArtifactLLMResponse;
}): SandboxArtifact {
  const fallback = fallbackArtifact(args);
  const base = {
    agent_id: fallback.agent_id,
    display_name: fallback.display_name,
    sandbox_disclosure: SANDBOX_DISCLOSURE_TEXT,
    title: args.raw.title?.trim() || fallback.title,
    summary: args.raw.summary?.trim() || fallback.summary,
    capabilities_used:
      args.raw.capabilities_used
        ?.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .slice(0, 8) ?? fallback.capabilities_used,
    structured_findings:
      args.raw.structured_findings
        ?.map((finding) => ({
          label: finding.label?.trim() ?? "",
          value: finding.value?.trim() ?? "",
        }))
        .filter((finding) => finding.label && finding.value)
        .slice(0, 12) ?? fallback.structured_findings,
    recommended_actions:
      args.raw.recommended_actions
        ?.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .slice(0, 8) ?? fallback.recommended_actions,
    risks:
      args.raw.risks
        ?.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        .slice(0, 8) ?? fallback.risks,
  };
  return {
    kind: "sandbox_artifact",
    ...base,
    markdown: renderMarkdown({ config: args.config, artifact: base }),
  };
}

function sandboxBidAvailability(
  config: SpecialistConfig,
): NonNullable<BidPayload["tool_availability"]> {
  return {
    status: "available",
    checked: ["sandbox-a2a", "ENABLE_SANDBOX_A2A"],
    reason: "Arbor sandbox A2A adapter is enabled for this agent",
    protocol: "arbor_a2a_bridge",
    execution_status: "arbor_sandbox_adapter",
    sandbox: true,
    proof: `sandbox runner: ${config.agent_id}`,
  };
}

function sandboxSystemPrompt(config: SpecialistConfig): string {
  return `${config.system_prompt}\n\n${SANDBOX_PRELUDE}`;
}

export function makeSandboxA2ASpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  return {
    config,
    async bid(prompt, taskType): Promise<SpecialistDecision> {
      if (!isSandboxA2AEnabled()) {
        const decline: DeclineDecision = {
          decline: true,
          reason:
            "Sandbox A2A is disabled (set ENABLE_SANDBOX_A2A=true to allow this agent to bid via the sandbox adapter).",
        };
        return decline;
      }
      const systemPrompt = `${sandboxSystemPrompt(config)}\n\nYou are participating in a sealed-bid auction as a sandbox A2A adapter. Bid only when the user's actual goal fits ${config.display_name}'s real domain. Decline if it doesn't.\n\nRespond with JSON only, one of:\n{ "decline": true, "reason": "<short reason>" }\nOR\n{ "bid_price": <number>, "capability_claim": "<one sentence framed as 'In sandbox mode, ...'>", "estimated_seconds": <integer> }`;
      const userPrompt = `${buildTaskContext(prompt, taskType)}\n\nDo you want to bid via the sandbox adapter? Bid only if your specialty fits this task; sandbox cost should be low (under $1) since no vendor call is made.`;
      let data: SandboxBidLLMResponse;
      try {
        data = await callOpenAIJSON<SandboxBidLLMResponse>({
          systemPrompt,
          userPrompt,
          maxTokens: 256,
          timeoutMs: 10_000,
          retries: 0,
        });
      } catch {
        return {
          bid_price: Math.min(0.5, config.cost_baseline),
          capability_claim: `In sandbox mode, ${config.display_name} will produce a structured draft for: ${config.one_liner}`,
          estimated_seconds: 35,
          agent_role: roleForSpecialist(config),
          sandbox_disclosure: SANDBOX_DISCLOSURE_TEXT,
          tool_availability: sandboxBidAvailability(config),
        };
      }
      if (data.decline) {
        return {
          decline: true,
          reason: data.reason ?? "capability mismatch (sandbox decline)",
        };
      }
      const bidPrice =
        typeof data.bid_price === "number" && data.bid_price > 0
          ? Math.min(1, Number(data.bid_price.toFixed(2)))
          : Math.min(0.5, config.cost_baseline);
      const estimated =
        typeof data.estimated_seconds === "number" && data.estimated_seconds > 0
          ? Math.max(10, Math.min(120, Math.floor(data.estimated_seconds)))
          : 40;
      const capability =
        typeof data.capability_claim === "string" && data.capability_claim.trim()
          ? data.capability_claim.trim()
          : `In sandbox mode, ${config.display_name} will draft a ${config.industry ?? "domain"} artifact aligned with the request.`;
      const bid: BidPayload = {
        bid_price: bidPrice,
        capability_claim: `[Sandbox A2A] ${capability}`,
        estimated_seconds: estimated,
        agent_role: roleForSpecialist(config),
        sandbox_disclosure: SANDBOX_DISCLOSURE_TEXT,
        execution_preview: `Sandbox A2A adapter will produce a structured JSON+markdown artifact in ${config.display_name}'s persona. Output is explicitly disclosed as sandbox, not vendor-native.`,
        tool_availability: sandboxBidAvailability(config),
      };
      return bid;
    },
    async execute(prompt, taskType): Promise<SpecialistOutput> {
      const artifact = await runSandboxA2AExecution({
        config,
        prompt,
        taskType,
      });
      if (isImplementationTask(prompt, taskType)) {
        // Implementation tasks want a plan-for-approval shape; convert the
        // sandbox markdown into an implementation plan artifact so downstream
        // approval flows continue to work, but keep the disclosure at the top.
        return implementationPlanFromText({
          config,
          prompt,
          text: `${artifact.sandbox_disclosure}\n\n${artifact.markdown}`,
        });
      }
      return artifact.markdown;
    },
  };
}

/**
 * Direct sandbox execution helper for the A2A route, where we want the
 * structured artifact (not just markdown) to populate task_runs and the A2A
 * response.
 */
export async function runSandboxA2AExecution(args: {
  config: SpecialistConfig;
  prompt: string;
  taskType: string;
}): Promise<SandboxArtifact> {
  const systemPrompt = `${sandboxSystemPrompt(args.config)}\n\nYou will produce a structured JSON artifact for the task below. The user is aware this is a sandbox run; do not pretend otherwise.\n\nReturn JSON only with this exact shape:\n{\n  "title": string,\n  "summary": string (2-4 sentences),\n  "capabilities_used": string[],\n  "structured_findings": [{ "label": string, "value": string }],\n  "recommended_actions": string[],\n  "risks": string[]\n}`;
  const userPrompt = buildTaskContext(args.prompt, args.taskType);
  try {
    const raw = await callOpenAIJSON<SandboxArtifactLLMResponse>({
      systemPrompt,
      userPrompt,
      maxTokens: 900,
      timeoutMs: 30_000,
      retries: 0,
    });
    return normalizeArtifact({
      config: args.config,
      prompt: args.prompt,
      raw,
    });
  } catch {
    // Plain-text fallback so we still produce something useful when JSON
    // generation fails. We wrap the text into a single finding so the artifact
    // shape stays consistent for downstream consumers.
    let text: string;
    try {
      text = await callOpenAI({
        systemPrompt: sandboxSystemPrompt(args.config),
        userPrompt,
        maxTokens: 800,
        timeoutMs: 30_000,
        retries: 0,
      });
    } catch (err) {
      return fallbackArtifact({ config: args.config, prompt: args.prompt });
    }
    return normalizeArtifact({
      config: args.config,
      prompt: args.prompt,
      raw: {
        title: `${args.config.display_name} sandbox draft`,
        summary: text.slice(0, 400),
        structured_findings: [{ label: "Sandbox output", value: text }],
        recommended_actions: [
          "Treat this draft as a sandbox sketch, not vendor output.",
        ],
        risks: [
          "JSON formatting fell back to plain text; the artifact is best-effort.",
        ],
      },
    });
  }
}

export const __test = {
  fallbackArtifact,
  normalizeArtifact,
  renderMarkdown,
};
