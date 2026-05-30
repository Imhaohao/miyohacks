import {
  callRemoteTool,
  discoverTools,
  flattenToolResult,
  type RemoteMcpTool,
  type ToolCallResult,
} from "../mcp-outbound";
import {
  extractDevinSessionId,
  extractPrMetadata,
  mcpToolOutcome,
  previewValue,
} from "../tool-call-audit";
import type {
  BidPayload,
  DeclineDecision,
  ProbeResult,
  SpecialistConfig,
  SpecialistExecuteContext,
  SpecialistExecuteResult,
  SpecialistOutput,
  SpecialistProvenance,
  SpecialistRunner,
  ToolCallAuditInput,
} from "../types";
import { buildTaskContext } from "../campaign-context";
import { verifyPullRequestUrl } from "../github-pr";
import { toPublicTier } from "./tiers";

const CREATE_TOOL = "devin_session_create";
const GATHER_TOOL = "devin_session_gather";
const EVENTS_TOOL = "devin_session_events";
const INTERACT_TOOL = "devin_session_interact";

export function isLegacyDevinApiKey(key: string | undefined): boolean {
  const value = key?.trim();
  return Boolean(value?.startsWith("apk_") || value?.startsWith("apk_user_"));
}

function apiKey(config: SpecialistConfig): string | undefined {
  return config.mcp_api_key_env ? process.env[config.mcp_api_key_env]?.trim() : undefined;
}

function mcpHeaders(config: SpecialistConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [header, envName] of Object.entries(config.mcp_header_env_vars ?? {})) {
    const value = process.env[envName]?.trim();
    if (value) headers[header] = value;
  }
  return headers;
}

function configProblem(config: SpecialistConfig): string | null {
  const key = apiKey(config);
  if (!key) return `${config.mcp_api_key_env ?? "DEVIN_API_KEY"} is not configured.`;
  if (isLegacyDevinApiKey(key)) {
    return "Devin MCP does not support the configured legacy API key format; use a service-user or current Devin API key, and set DEVIN_ORG_ID when the key is account-scoped.";
  }
  return null;
}

function inScope(prompt: string, taskType: string): boolean {
  const text = `${prompt} ${taskType}`.toLowerCase();
  return [
    "code",
    "repo",
    "github",
    "pull request",
    "pr",
    "webapp",
    "web app",
    "frontend",
    "backend",
    "bug",
    "test",
    "implement",
    "build",
    "tic tac toe",
  ].some((signal) => text.includes(signal));
}

function toolByName(tools: RemoteMcpTool[], name: string): RemoteMcpTool | undefined {
  return tools.find((tool) => tool.name === name);
}

function sessionCreateCandidates(
  tool: RemoteMcpTool | undefined,
  prompt: string,
  taskType: string,
): Record<string, unknown>[] {
  const title = `Arbor task: ${taskType}`.slice(0, 80);
  const base = {
    prompt,
    title,
    tags: ["arbor", "agent-marketplace"],
  };
  const props =
    tool?.inputSchema &&
    typeof tool.inputSchema === "object" &&
    !Array.isArray(tool.inputSchema) &&
    "properties" in tool.inputSchema &&
    tool.inputSchema.properties &&
    typeof tool.inputSchema.properties === "object"
      ? (tool.inputSchema.properties as Record<string, unknown>)
      : {};

  const candidates: Record<string, unknown>[] = [];
  if ("prompt" in props) candidates.push(base);
  if ("sessions" in props) candidates.push({ sessions: [base] });
  if ("session" in props) candidates.push({ session: base });
  candidates.push(base, { sessions: [base] });

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sessionIdArgs(sessionId: string): Record<string, unknown>[] {
  return [
    { session_id: sessionId },
    { sessionId },
    { id: sessionId },
    { session_ids: [sessionId] },
  ];
}

function outputForSession(args: {
  sessionId: string;
  gatherText?: string;
  eventsText?: string;
  prUrl?: string;
  prNumber?: number;
}): SpecialistOutput {
  return [
    "# Devin bridge session",
    "",
    `Devin session id: \`${args.sessionId}\``,
    args.prUrl
      ? `Pull request: ${args.prUrl}${args.prNumber ? ` (#${args.prNumber})` : ""}`
      : "Pull request: session completed or started, PR missing from captured MCP output.",
    "",
    "## Latest Devin output",
    "",
    args.gatherText || args.eventsText || "No settled Devin output was captured yet.",
  ].join("\n");
}

export function makeDevinMcpBridgeSpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  if (!config.mcp_endpoint) {
    throw new Error("Devin bridge requires mcp_endpoint");
  }
  const endpoint = config.mcp_endpoint;
  const key = apiKey(config);
  const options = { headers: mcpHeaders(config) };
  let cachedTools: RemoteMcpTool[] | null = null;

  async function getTools(): Promise<RemoteMcpTool[]> {
    if (cachedTools) return cachedTools;
    cachedTools = await discoverTools(endpoint, key, options);
    return cachedTools;
  }

  async function recordedTool(
    context: SpecialistExecuteContext | undefined,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolCallResult> {
    const input: ToolCallAuditInput = {
      agent_id: context?.agent_id ?? config.agent_id,
      phase: "execute",
      transport: "a2a-bridge",
      provider: "devin",
      endpoint,
      method: "tools/call",
      tool_name: toolName,
      arguments: args,
    };
    const run = () => callRemoteTool(endpoint, toolName, args, timeoutMs, key, options);
    if (!context?.toolRecorder) return await run();
    return await context.toolRecorder.record(input, run, (result) => {
      const text = flattenToolResult(result);
      const sessionId =
        toolName === CREATE_TOOL ? extractDevinSessionId(text) : undefined;
      const pr = extractPrMetadata(text);
      return mcpToolOutcome({
        result,
        preview: previewValue(text),
        external_session_id: sessionId,
        pr_url: pr.pr_url,
        pr_number: pr.pr_number,
      });
    });
  }

  async function verifyPr(
    context: SpecialistExecuteContext | undefined,
    prUrl: string,
  ): Promise<{ pr_url?: string; pr_number?: number }> {
    const token = process.env.GITHUB_TOKEN?.trim();
    const input: ToolCallAuditInput = {
      agent_id: context?.agent_id ?? config.agent_id,
      phase: "pr",
      transport: "api",
      provider: "github",
      endpoint: "https://api.github.com",
      method: "GET",
      tool_name: "github_pull_request_verify",
      arguments: { pr_url: prUrl },
    };
    const run = () => verifyPullRequestUrl(prUrl, token);
    if (!context?.toolRecorder) {
      const verified = await run();
      return { pr_url: verified.url, pr_number: verified.number };
    }
    const verified = await context.toolRecorder.record(input, run, (result) => ({
      ok: true,
      result_preview: previewValue(result),
      pr_url: result.url,
      pr_number: result.number,
    }));
    return { pr_url: verified.url, pr_number: verified.number };
  }

  function fallback(reason: string): SpecialistExecuteResult {
    const provenance: SpecialistProvenance = {
      tier: toPublicTier(config.tier),
      transport: "a2a-bridge",
      live_tools_called: false,
      proof_level: "none",
      successful_tool_call_count: 0,
      fallback_reason: reason,
      endpoint,
    };
    return {
      output: `[FALLBACK — Devin bridge unavailable]\n\n${reason}`,
      provenance,
    };
  }

  return {
    config,
    async bid(prompt, taskType): Promise<BidPayload | DeclineDecision> {
      if (!inScope(prompt, taskType)) {
        return {
          decline: true,
          reason: "Devin is reserved for coding, repo, build, and PR tasks.",
        };
      }
      const problem = configProblem(config);
      if (problem) return { decline: true, reason: problem };
      try {
        const tools = await getTools();
        if (!toolByName(tools, CREATE_TOOL)) {
          return {
            decline: true,
            reason: "Devin MCP is reachable but devin_session_create is unavailable.",
          };
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return {
          decline: true,
          reason: `Devin MCP tool discovery failed: ${reason.slice(0, 220)}`,
        };
      }
      return {
        bid_price: config.cost_baseline,
        capability_claim:
          "I will create a real Devin session, track it through Devin MCP, and report session/PR proof back to Arbor.",
        estimated_seconds: 900,
      };
    },

    async probe(_taskType: string): Promise<ProbeResult> {
      // taskType is intentionally unused: Devin's capability claim is "I can do
      // code work," which is decided solely by whether devin_session_create is
      // advertised by the MCP server, not by the incoming task category.
      const t0 = Date.now();
      let tools: RemoteMcpTool[];
      try {
        tools = await getTools();
      } catch (err) {
        return {
          status: "fail",
          duration_ms: Date.now() - t0,
          error_message: String((err as Error)?.message ?? err),
        };
      }
      const duration_ms = Date.now() - t0;
      const createTool = toolByName(tools, CREATE_TOOL);
      if (!createTool) {
        return {
          status: "fail",
          duration_ms,
          error_message: `Devin MCP did not expose ${CREATE_TOOL}`,
          response_excerpt: JSON.stringify(tools.map((t) => t.name)).slice(0, 300),
        };
      }
      return {
        status: "pass",
        duration_ms,
        response_excerpt: `devin_session_create available; tools=${tools.length}`,
      };
    },

    async execute(prompt, taskType, context): Promise<SpecialistExecuteResult> {
      const problem = configProblem(config);
      if (problem) return fallback(problem);

      let tools: RemoteMcpTool[];
      try {
        tools = await getTools();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return fallback(`Devin MCP tool discovery failed: ${reason}`);
      }

      const createTool = toolByName(tools, CREATE_TOOL);
      if (!createTool) {
        return fallback("Devin MCP did not advertise devin_session_create.");
      }

      const sessionPrompt = buildTaskContext(prompt, taskType);
      let createText = "";
      let sessionId: string | undefined;
      let createError: string | undefined;
      for (const args of sessionCreateCandidates(createTool, sessionPrompt, taskType)) {
        try {
          const result = await recordedTool(context, CREATE_TOOL, args, 30_000);
          createText = flattenToolResult(result);
          sessionId = extractDevinSessionId(createText);
          if (result.isError !== true && sessionId) break;
          createError = createText || "devin_session_create returned no session id";
        } catch (err) {
          createError = err instanceof Error ? err.message : String(err);
        }
      }

      if (!sessionId) {
        const provenance: SpecialistProvenance = {
          tier: toPublicTier(config.tier),
          transport: "a2a-bridge",
          live_tools_called:
            (context?.toolRecorder?.successfulCallIds().length ?? 0) > 0,
          proof_level: "tool_call",
          successful_tool_call_count:
            context?.toolRecorder?.successfulCallIds().length ?? 0,
          tool_call_ids: context?.toolRecorder?.successfulCallIds() ?? [],
          fallback_reason:
            "devin_session_create did not return a session id, so Devin did not prove task acceptance.",
          endpoint,
        };
        return {
          output: `[FALLBACK — Devin session missing]\n\n${createError ?? createText}`,
          provenance,
        };
      }

      let gatherText = "";
      const gatherTool = toolByName(tools, GATHER_TOOL);
      if (gatherTool) {
        for (const args of [{ session_ids: [sessionId] }, { sessionIds: [sessionId] }]) {
          try {
            const result = await recordedTool(context, GATHER_TOOL, args, 120_000);
            gatherText = flattenToolResult(result);
            if (result.isError !== true) break;
          } catch {
            // Fall back to events/interact below.
          }
        }
      }

      let eventsText = "";
      const eventsTool = toolByName(tools, EVENTS_TOOL);
      if (eventsTool) {
        for (const args of sessionIdArgs(sessionId)) {
          try {
            const result = await recordedTool(context, EVENTS_TOOL, args, 30_000);
            eventsText = flattenToolResult(result);
            if (result.isError !== true) break;
          } catch {
            // Try the next known session-id shape.
          }
        }
      }

      if (!gatherText && !eventsText && toolByName(tools, INTERACT_TOOL)) {
        for (const args of sessionIdArgs(sessionId)) {
          try {
            const result = await recordedTool(context, INTERACT_TOOL, args, 30_000);
            eventsText = flattenToolResult(result);
            if (result.isError !== true) break;
          } catch {
            // Try the next known session-id shape.
          }
        }
      }

      const prCandidate = extractPrMetadata(`${gatherText}\n${eventsText}`);
      let pr = { pr_url: undefined, pr_number: undefined } as {
        pr_url?: string;
        pr_number?: number;
      };
      if (prCandidate.pr_url) {
        try {
          pr = await verifyPr(context, prCandidate.pr_url);
        } catch {
          pr = {};
        }
      }
      const successfulToolIds = context?.toolRecorder?.successfulCallIds() ?? [];
      const provenance: SpecialistProvenance = {
        tier: toPublicTier(config.tier),
        transport: "a2a-bridge",
        live_tools_called: successfulToolIds.length > 0,
        proof_level: pr.pr_url ? "pr_opened" : "agent_session",
        successful_tool_call_count: successfulToolIds.length,
        tool_call_ids: successfulToolIds,
        external_session_id: sessionId,
        pr_url: pr.pr_url,
        pr_number: pr.pr_number,
        endpoint,
      };

      return {
        output: outputForSession({
          sessionId,
          gatherText,
          eventsText,
          prUrl: pr.pr_url,
          prNumber: pr.pr_number,
        }),
        provenance,
      };
    },
  };
}
