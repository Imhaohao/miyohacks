/**
 * MCP-forwarding specialist runner.
 *
 * For specialists with `mcp_endpoint` set, both bid and execute are forwarded
 * to the real remote MCP server via an LLM-driven tool-calling loop:
 *
 *   1. At bid time, ask the model "given these tools (discovered via tools/list)
 *      and this task, can you do it and at what cost?" — JSON-only response.
 *   2. At execute time, run a chat-completion loop where the model can call
 *      the remote MCP's tools (proxied through `callRemoteTool`) until it
 *      produces a final answer or hits the round/time cap.
 *
 * Tool discovery is cached per process for the lifetime of the runner so we
 * don't `tools/list` on every bid.
 */

import {
  discoverTools,
  callRemoteTool,
  flattenToolResult,
  type RemoteMcpTool,
} from "../mcp-outbound";
import { parseJSONLoose } from "../openai";
import { buildTaskContext } from "../campaign-context";
import {
  mcpToolOutcome,
  previewValue,
} from "../tool-call-audit";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  BidPayload,
  SpecialistOutput,
  SpecialistExecuteResult,
  SpecialistProvenance,
  SpecialistExecuteContext,
  ToolCallAuditInput,
  ProbeResult,
} from "../types";
import { toPublicTier } from "./tiers";

const MODEL = "gpt-5.5";
const CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MAX_EXECUTE_ROUNDS = 6;
const VICKREY_PRELUDE =
  "You are bidding in a Vickrey second-price sealed-bid auction. The price you actually pay if you win is set by the second-highest bid, so your dominant strategy is to bid your true cost. Bid honestly.";

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set");
  return k;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface ChatChoice {
  message: ChatMessage;
  finish_reason?: string;
}

interface ChatResponse {
  choices: ChatChoice[];
}

function toOpenAITools(remote: RemoteMcpTool[]) {
  return remote.map((t) => ({
    type: "function" as const,
    function: {
      name: sanitizeName(t.name),
      description: t.description?.slice(0, 1024) ?? "",
      parameters: (t.inputSchema as Record<string, unknown> | undefined) ?? {
        type: "object",
        properties: {},
      },
    },
  }));
}

/** OpenAI requires tool names to match `^[a-zA-Z0-9_-]+$`. */
function sanitizeName(n: string): string {
  return n.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function resolveMcpHeaders(config: SpecialistConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [header, envName] of Object.entries(config.mcp_header_env_vars ?? {})) {
    const value = process.env[envName]?.trim();
    if (value) headers[header] = value;
  }
  return headers;
}

/**
 * Names of declared header env vars that are missing at runtime. Used to
 * decline/probe-fail loudly instead of hitting the endpoint unauthenticated.
 */
function missingHeaderEnvVars(config: SpecialistConfig): string[] {
  return Object.values(config.mcp_header_env_vars ?? {}).filter(
    (envName) => !process.env[envName]?.trim(),
  );
}

function providerFromConfig(config: SpecialistConfig): string {
  return config.sponsor || config.agent_id;
}

async function chatCompletion(body: Record<string, unknown>, timeoutMs: number): Promise<ChatResponse> {
  // gpt-5.5 rejects `reasoning_effort` together with `tools` on /v1/chat/completions
  // ("Function tools with reasoning_effort are not supported"). Strip it when
  // tools are present; keep it on plain calls where it prevents empty output.
  const sanitized: Record<string, unknown> = { ...body };
  if (sanitized.tools && "reasoning_effort" in sanitized) {
    delete sanitized.reasoning_effort;
  }
  const res = await withTimeout(
    fetch(CHAT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(sanitized),
    }),
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as ChatResponse;
}

interface BidLLMResponse {
  decline?: boolean;
  reason?: string;
  bid_price?: number;
  capability_claim?: string;
  estimated_seconds?: number;
}

export function makeMcpForwardingSpecialist(
  config: SpecialistConfig,
): SpecialistRunner {
  if (!config.mcp_endpoint) {
    throw new Error(
      `makeMcpForwardingSpecialist requires mcp_endpoint on ${config.agent_id}`,
    );
  }
  const endpoint = config.mcp_endpoint;
  const remoteApiKey = config.mcp_api_key_env
    ? process.env[config.mcp_api_key_env]
    : undefined;
  const mcpOptions = {
    headers: resolveMcpHeaders(config),
    requiresSession: config.mcp_requires_session,
  };
  let cachedTools: RemoteMcpTool[] | null = null;
  let toolDiscoveryFailed = false;
  let toolDiscoveryError: string | null = null;

  async function getTools(): Promise<RemoteMcpTool[]> {
    if (cachedTools) return cachedTools;
    if (toolDiscoveryFailed) return [];
    try {
      cachedTools = await discoverTools(endpoint, remoteApiKey, mcpOptions);
      return cachedTools;
    } catch (err) {
      toolDiscoveryFailed = true;
      toolDiscoveryError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[arbor] specialist "${config.agent_id}" MCP discovery failed: ${toolDiscoveryError}`,
      );
      return [];
    }
  }

  return {
    config,

    async probe(_taskType: string): Promise<ProbeResult> {
      // taskType is intentionally unused: MCP-forwarding agents claim to cover
      // whatever capabilities their tools provide. The tools list itself is the
      // liveness signal — if tools/list succeeds and returns at least one tool,
      // the endpoint is alive and functional.
      const t0 = Date.now();

      // If the config declares a required API key env var, verify it is set
      // before hitting the network.
      if (config.mcp_api_key_env && !remoteApiKey) {
        return {
          status: "fail",
          duration_ms: Date.now() - t0,
          error_message: `missing api key: ${config.mcp_api_key_env}`,
        };
      }
      // Same for header-based auth (e.g. X-Api-Key): decline loudly rather than
      // hitting the endpoint unauthenticated and reporting an opaque 401.
      const missingHeaders = missingHeaderEnvVars(config);
      if (missingHeaders.length > 0) {
        return {
          status: "fail",
          duration_ms: Date.now() - t0,
          error_message: `missing api key: ${missingHeaders.join(", ")}`,
        };
      }

      let tools: RemoteMcpTool[];
      try {
        tools = await discoverTools(endpoint, remoteApiKey, mcpOptions);
        // Update the cache so subsequent bid/execute calls benefit.
        cachedTools = tools;
      } catch (err) {
        return {
          status: "fail",
          duration_ms: Date.now() - t0,
          error_message: String((err as Error)?.message ?? err),
        };
      }

      const duration_ms = Date.now() - t0;

      if (tools.length === 0) {
        return {
          status: "fail",
          duration_ms,
          error_message: "mcp endpoint returned 0 tools",
          response_excerpt: "[]",
        };
      }

      return {
        status: "pass",
        duration_ms,
        response_excerpt: `tools=${tools.length}: ${tools.slice(0, 5).map((t) => t.name).join(", ")}`.slice(0, 300),
      };
    },

    async bid(prompt, taskType): Promise<SpecialistDecision> {
      const tools = await getTools();
      if (tools.length === 0) {
        return {
          decline: true,
          reason:
            toolDiscoveryError
              ? `Remote MCP tool discovery is unavailable: ${toolDiscoveryError}`
              : "Remote MCP tool discovery is unavailable, so this specialist cannot safely execute this task right now.",
        };
      }
      const toolList = tools
        .slice(0, 20)
        .map((t) => `- ${t.name}: ${t.description?.slice(0, 200) ?? ""}`)
        .join("\n");

      const systemPrompt = `${config.system_prompt}\n\n${VICKREY_PRELUDE}\n\nYou are connected to a real MCP server at ${endpoint}. Available tools:\n${toolList || "(tool discovery unavailable — bid only if your description clearly fits)"}\n\nYour cost baseline for a typical task is $${config.cost_baseline.toFixed(2)}. Adjust by task complexity but stay honest.\n\nIMPORTANT: This marketplace handles tasks across every domain. Decline if the user's goal is outside what your remote tools can actually do — don't translate the goal into your specialty. Your capability_claim must be a concrete execution plan for the user's actual goal: 2-4 numbered steps naming which of your real tools you would call and on what, in 2-3 sentences total. Generic specialty pitches will be rejected by the auctioneer.\n\nReply with JSON only, one of:\n{ "decline": true, "reason": "<short reason>" }\nOR\n{ "bid_price": <number>, "capability_claim": "<2-4 step plan for this specific task>", "estimated_seconds": <integer> }`;

      const userPrompt = `${buildTaskContext(prompt, taskType)}\n\nDo you bid? Bid only if your tools fit this task.`;
      const text = await callPlain(systemPrompt, userPrompt, 320, 10_000);
      const data = parseJSONLoose<BidLLMResponse>(text);
      if (data.decline) {
        return { decline: true, reason: data.reason ?? "capability mismatch" };
      }
      if (
        typeof data.bid_price !== "number" ||
        typeof data.capability_claim !== "string" ||
        typeof data.estimated_seconds !== "number"
      ) {
        return {
          bid_price: config.cost_baseline,
          capability_claim: config.one_liner,
          estimated_seconds: 30,
          plan_source: "baseline",
        };
      }
      const bid: BidPayload = {
        bid_price: Math.max(0.01, Number(data.bid_price.toFixed(2))),
        capability_claim: data.capability_claim,
        estimated_seconds: Math.max(1, Math.floor(data.estimated_seconds)),
        plan_source: "llm",
      };
      return bid;
    },

    async execute(
      prompt,
      taskType,
      context?: SpecialistExecuteContext,
    ): Promise<SpecialistExecuteResult> {
      const tools = await getTools();
      const successfulToolCallIds: string[] = [];
      const callInputBase = {
        agent_id: context?.agent_id ?? config.agent_id,
        phase: "execute" as const,
        transport: "mcp" as const,
        provider: providerFromConfig(config),
        endpoint,
        method: "tools/call",
      };

      async function runMcpTool(realName: string, args: Record<string, unknown>) {
        const input: ToolCallAuditInput = {
          ...callInputBase,
          tool_name: realName,
          arguments: args,
        };
        const run = () =>
          callRemoteTool(endpoint, realName, args, 25_000, remoteApiKey, mcpOptions);
        if (!context?.toolRecorder) {
          const result = await run();
          if (result.isError !== true) successfulToolCallIds.push("unpersisted");
          return result;
        }
        return await context.toolRecorder.record(input, run, (result) => {
          const preview = previewValue(result.content);
          return mcpToolOutcome({ result, preview });
        });
      }

      // No tools discovered → fall back to a plain completion in persona, with
      // a banner that the MCP server was unreachable. No silent mock.
      if (tools.length === 0) {
        const sys = `${config.system_prompt}\n\nYou are normally connected to ${endpoint} but tool discovery is unavailable right now. Produce your best persona-driven answer to the user's actual goal and clearly note in the output that live MCP tool calls were not made.`;
        const raw = await callPlain(
          sys,
          buildTaskContext(prompt, taskType),
          4000,
          60_000,
        );
        const provenance: SpecialistProvenance = {
          tier: toPublicTier(config.tier),
          live_tools_called: false,
          transport: "mcp",
          proof_level: "none",
          successful_tool_call_count: 0,
          fallback_reason: "tool discovery unavailable",
          endpoint,
        };
        const output: SpecialistOutput = `[FALLBACK — MCP endpoint unreachable, no tools called]\n\n${raw}`;
        return { output, provenance };
      }

      const openaiTools = toOpenAITools(tools);
      const sysPrompt = `${config.system_prompt}\n\nYou were picked for the task below. You are connected to a real MCP server (${endpoint}). Use the provided tools to actually do the work — call them as needed, then synthesize a clear final answer in markdown that directly addresses the user's goal. Stay in character as ${config.display_name}. Do not call more than ${MAX_EXECUTE_ROUNDS} rounds of tools.`;
      const messages: ChatMessage[] = [
        { role: "system", content: sysPrompt },
        { role: "user", content: buildTaskContext(prompt, taskType) },
      ];
      const nameMap = new Map<string, string>();
      for (const t of tools) nameMap.set(sanitizeName(t.name), t.name);

      for (let round = 0; round < MAX_EXECUTE_ROUNDS; round++) {
        const res = await chatCompletion(
          {
            model: MODEL,
            messages,
            tools: openaiTools,
            tool_choice: "auto",
            // Tool-call rounds can't use reasoning_effort with gpt-5.5
            // (chatCompletion strips it), so leave room for reasoning + the
            // actual tool call / final answer.
            max_completion_tokens: 4000,
          },
          45_000,
        );
        const msg = res.choices[0]?.message;
        if (!msg) throw new Error("OpenAI returned no message");
        messages.push(msg);

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          const provenance: SpecialistProvenance = {
            tier: toPublicTier(config.tier),
            live_tools_called: successfulToolCallIds.length > 0,
            transport: "mcp",
            proof_level:
              successfulToolCallIds.length > 0 ? "tool_call" : "none",
            successful_tool_call_count: successfulToolCallIds.length,
            tool_call_ids: successfulToolCallIds,
            endpoint,
          };
          return { output: (msg.content ?? "").trim(), provenance };
        }

        for (const call of msg.tool_calls) {
          const realName = nameMap.get(call.function.name) ?? call.function.name;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            // leave empty; remote may still tolerate
          }
          let toolText: string;
          try {
            const before = context?.toolRecorder?.successfulCallIds().length ?? 0;
            const r = await runMcpTool(realName, args);
            const after = context?.toolRecorder?.successfulCallIds().length ?? before;
            if (after > before) {
              successfulToolCallIds.push(
                ...context!.toolRecorder!.successfulCallIds().slice(before),
              );
            }
            toolText = flattenToolResult(r);
            if (r.isError) toolText = `tool reported error: ${toolText}`;
          } catch (err) {
            toolText = `tool call failed: ${err instanceof Error ? err.message : String(err)}`;
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: toolText.slice(0, 8_000),
          });
        }
      }

      // Hit the round cap — ask for a final synthesis.
      messages.push({
        role: "user",
        content:
          "You've used your tool-call budget. Synthesize your final answer now in markdown, citing what you found via the MCP tools.",
      });
      // gpt-5.5's max_completion_tokens includes reasoning tokens, so a 1500
      // cap can leave only ~200 visible tokens after even minimal reasoning
      // — that's why short outputs were getting truncated mid-sentence.
      const final = await chatCompletion(
        {
          model: MODEL,
          messages,
          max_completion_tokens: 4000,
          reasoning_effort: "none",
        },
        45_000,
      );
      const provenance: SpecialistProvenance = {
        tier: toPublicTier(config.tier),
        live_tools_called: successfulToolCallIds.length > 0,
        transport: "mcp",
        proof_level: successfulToolCallIds.length > 0 ? "tool_call" : "none",
        successful_tool_call_count: successfulToolCallIds.length,
        tool_call_ids: successfulToolCallIds,
        endpoint,
      };
      return { output: (final.choices[0]?.message?.content ?? "").trim(), provenance };
    },
  };
}

async function callPlain(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  const res = await chatCompletion(
    {
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
      reasoning_effort: "none",
    },
    timeoutMs,
  );
  return (res.choices[0]?.message?.content ?? "").trim();
}
