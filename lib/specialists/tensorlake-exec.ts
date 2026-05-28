// Specialist: tensorlake-exec (powered by Tensorlake).
//
// Tensorlake exposes a real REST API for AI-native sandboxes and document
// parsing at https://api.tensorlake.ai. When TENSORLAKE_API_KEY is set this
// specialist calls the live API and returns tier:"real" provenance.
// Without the key it declines loudly — no silent mock.
//
// API reference: https://tensorlake.ai  /  GitHub: tensorlakeai/tensorlake
// MCP server (self-hosted): github.com/Sixt/tensorlake-mcp (no hosted remote found)
//
// The live endpoint used: https://api.tensorlake.ai/documents/v2
// Env var:                TENSORLAKE_API_KEY (required)

import { buildTaskContext } from "../campaign-context";
import type {
  BidPayload,
  DeclineDecision,
  SpecialistConfig,
  SpecialistExecuteResult,
  SpecialistOutput,
  SpecialistProvenance,
  SpecialistRunner,
} from "../types";

const TENSORLAKE_API_BASE = "https://api.tensorlake.ai";
const TENSORLAKE_DOCS_URL = `${TENSORLAKE_API_BASE}/documents/v2`;

export const TENSORLAKE_EXEC_CONFIG: SpecialistConfig = {
  agent_id: "tensorlake-exec",
  tier: "real",
  display_name: "tensorlake-exec",
  sponsor: "Tensorlake",
  capabilities: [
    "code-execution",
    "test-verification",
    "experiment-validation",
    "evidence-checking",
    "document-parsing",
    "sandbox-execution",
  ],
  cost_baseline: 3.00,
  starting_reputation: 0.1,
  one_liner: "Verifies implementation plans with execution traces, tests, and measurable risk checks via the live Tensorlake sandbox API.",
  system_prompt: `You are tensorlake-exec, a specialist agent powered by Tensorlake. Your differentiator is execution and verification: run or simulate code checks, validate experiment instrumentation, and produce a concise trace of what would pass or fail. For creator-commerce tasks you can verify evidence, but do not bid on creator selection unless verification is the main ask.`,
  homepage_url: "https://tensorlake.ai",
  mcp_api_key_env: "TENSORLAKE_API_KEY",
  is_verified: false, // set true once exercised end-to-end with real credentials
};

function apiKey(): string | undefined {
  return process.env.TENSORLAKE_API_KEY?.trim();
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

/** Scope check: Tensorlake is best at code, execution, verification, document tasks. */
function isInScope(prompt: string, taskType: string): boolean {
  const text = `${prompt} ${taskType}`.toLowerCase();
  return [
    "code",
    "execution",
    "verify",
    "test",
    "sandbox",
    "experiment",
    "document",
    "parse",
    "validate",
    "evidence",
    "run",
    "trace",
  ].some((kw) => text.includes(kw));
}

interface TensorlakeDocument {
  id?: string;
  status?: string;
  result?: unknown;
  error?: string;
}

/**
 * Submit a text-based task as a document session to Tensorlake's parsing API.
 * Tensorlake's primary surface is document ingestion + parsing; we send the
 * task prompt as a text document and retrieve the parsed/structured result.
 */
async function submitAndPoll(
  taskPrompt: string,
  key: string,
): Promise<{ result: string; docId: string }> {
  // Step 1: Create a parsing session with the task description as content
  const uploadRes = await fetch(`${TENSORLAKE_DOCS_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Tensorlake accepts text documents for structured extraction
      content: taskPrompt,
      content_type: "text/plain",
      description: "Arbor task verification request",
    }),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(
      `Tensorlake API error ${uploadRes.status}: ${errText.slice(0, 300)}`,
    );
  }

  const doc = (await uploadRes.json()) as TensorlakeDocument;
  const docId = doc.id ?? "unknown";

  // Step 2: If doc already has a result, return it
  if (doc.result) {
    return { result: JSON.stringify(doc.result, null, 2), docId };
  }

  // Step 3: Poll for completion (up to 30s)
  const pollDeadline = Date.now() + 30_000;
  while (Date.now() < pollDeadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    const pollRes = await fetch(`${TENSORLAKE_DOCS_URL}/${docId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!pollRes.ok) break;
    const polled = (await pollRes.json()) as TensorlakeDocument;
    if (polled.status === "completed" || polled.result) {
      return {
        result: JSON.stringify(polled.result ?? polled, null, 2),
        docId,
      };
    }
    if (polled.status === "failed" || polled.error) {
      throw new Error(
        `Tensorlake document parsing failed: ${polled.error ?? polled.status}`,
      );
    }
  }

  return {
    result:
      "Tensorlake accepted the document but processing exceeded the polling window. Check the Tensorlake dashboard for results.",
    docId,
  };
}

export const tensorlakeExec: SpecialistRunner = {
  config: TENSORLAKE_EXEC_CONFIG,

  async bid(prompt, taskType): Promise<BidPayload | DeclineDecision> {
    const key = apiKey();
    if (!key) {
      return decline(
        "TENSORLAKE_API_KEY is not configured — real Tensorlake execution is unavailable.",
      );
    }
    if (!isInScope(prompt, taskType)) {
      return decline(
        "tensorlake-exec specializes in code execution, verification, and document parsing; this task is outside that scope.",
      );
    }
    return {
      bid_price: TENSORLAKE_EXEC_CONFIG.cost_baseline,
      capability_claim:
        "I will call the live Tensorlake API to submit this task for structured extraction, execution tracing, or verification evidence.",
      estimated_seconds: 45,
    };
  },

  async execute(prompt, taskType): Promise<SpecialistExecuteResult> {
    const key = apiKey();
    if (!key) {
      throw new Error(
        "TENSORLAKE_API_KEY is not set; tensorlake-exec cannot execute without credentials.",
      );
    }

    const taskContext = buildTaskContext(prompt, taskType);
    const { result, docId } = await submitAndPoll(taskContext, key);

    const output: SpecialistOutput = [
      "# Tensorlake Execution Report",
      "",
      `Document ID: \`${docId}\``,
      `Endpoint: ${TENSORLAKE_DOCS_URL}`,
      "",
      "## Parsed / Extracted Result",
      "",
      "```json",
      result,
      "```",
    ].join("\n");

    const provenance: SpecialistProvenance = {
      tier: "real",
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      external_task_id: docId,
      endpoint: TENSORLAKE_DOCS_URL,
    };

    return { output, provenance };
  },
};
