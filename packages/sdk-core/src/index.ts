/**
 * @agent-auction/sdk-core
 *
 * Zero-dependency TypeScript client for the Agent Auction Protocol REST API
 * at /api/v1/*. Used by the framework wrappers (@agent-auction/langchain,
 * /vercel-ai, /mastra) but also fine to use directly.
 */

export interface AuctionClientOptions {
  /** Base URL of the deployment, e.g. "https://auction.example.com". */
  baseUrl?: string;
  /** Identifier sent as posted_by. Default "agent:sdk". */
  agentId?: string;
  /** Override fetch (e.g. for retry middleware). */
  fetch?: typeof fetch;
}

export type TaskWorkflowMode = "product_demo" | "protocol_core";
export type AgentRosterClass =
  | "canonical_v0"
  | "demo_extension"
  | "discovered_contact"
  | "post_v0_integration";
export type AgentMockPolicy = "strict_no_mock" | "demo_mock_llm";

export interface PostTaskInput {
  prompt: string;
  /** Integer credits. Pricing unit: 100 credits = $1 USD. */
  max_budget: number;
  task_type?: string;
  workflow_mode?: TaskWorkflowMode;
  output_schema?: Record<string, unknown>;
}

export type TaskStatus =
  | "open"
  | "planning"
  | "shortlisting"
  | "bidding"
  | "awarded"
  | "plan_review"
  | "approved"
  | "executing"
  | "judging"
  | "synthesizing"
  | "complete"
  | "disputed"
  | "failed"
  | "cancelled";

export type PostTaskInitialStatus = "planning" | "bidding";

export interface BasePostTaskResult {
  task_id: string;
  status: PostTaskInitialStatus;
  workflow_mode: TaskWorkflowMode;
  bid_window_closes_at: number;
  web_view_url: string;
}

export interface ProductDemoPostTaskResult extends BasePostTaskResult {
  status: "planning";
  workflow_mode: "product_demo";
}

export interface ProtocolCorePostTaskResult extends BasePostTaskResult {
  status: "bidding";
  workflow_mode: "protocol_core";
}

export type PostTaskResult =
  | ProductDemoPostTaskResult
  | ProtocolCorePostTaskResult;

export interface TaskState {
  task: {
    _id: string;
    status: TaskStatus;
    prompt: string;
    /** Integer credits. */
    max_budget: number;
    /** Integer credits. */
    price_paid?: number;
    result?: { text: string; agent_id: string } | unknown;
    judge_verdict?: {
      verdict: "accept" | "reject";
      reasoning: string;
      quality_score: number;
    };
    [key: string]: unknown;
  } | null;
  bids: Array<{
    agent_id: string;
    /** Integer credits. */
    bid_price: number;
    score: number;
    capability_claim: string;
    [key: string]: unknown;
  }>;
  escrow: {
    status: "locked" | "released" | "refunded";
    /** Integer credits. */
    locked_amount: number;
    [key: string]: unknown;
  } | null;
  lifecycle: Array<{
    event_type: string;
    payload: Record<string, unknown>;
    timestamp: number;
    [key: string]: unknown;
  }>;
}

export interface Specialist {
  agent_id: string;
  sponsor: string;
  capabilities: string[];
  /** Integer credits (100 credits = $1). */
  cost_baseline: number;
  one_liner: string;
  reputation_score: number;
  total_tasks_completed: number;
  roster_class: AgentRosterClass;
  roster_label: string;
  roster_description: string;
  canonical_v0: boolean;
  execution_status?: string;
  execution_status_label?: string;
  mock_policy?: AgentMockPolicy;
  mock_policy_label?: string;
  mock_policy_description?: string;
}

export interface AwaitTaskOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const TERMINAL_STATUSES = new Set<TaskStatus>([
  "complete",
  "disputed",
  "failed",
  "cancelled",
]);

export class AuctionClient {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly _fetch: typeof fetch;

  constructor(opts: AuctionClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    this.agentId = opts.agentId ?? "agent:sdk";
    this._fetch = opts.fetch ?? fetch;
  }

  async postTask(
    input: PostTaskInput & { workflow_mode: "protocol_core" },
  ): Promise<ProtocolCorePostTaskResult>;
  async postTask(
    input: PostTaskInput & { workflow_mode?: "product_demo" | undefined },
  ): Promise<ProductDemoPostTaskResult>;
  async postTask(input: PostTaskInput): Promise<PostTaskResult>;
  async postTask(input: PostTaskInput): Promise<PostTaskResult> {
    return await this.request<PostTaskResult>("POST", "/api/v1/tasks", {
      ...input,
      agent_id: this.agentId,
    });
  }

  async getTask(task_id: string): Promise<TaskState> {
    return await this.request<TaskState>(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(task_id)}`,
    );
  }

  async listSpecialists(task_type?: string): Promise<Specialist[]> {
    const qs = task_type
      ? `?task_type=${encodeURIComponent(task_type)}`
      : "";
    const res = await this.request<{ specialists: Specialist[] }>(
      "GET",
      `/api/v1/specialists${qs}`,
    );
    return res.specialists;
  }

  async raiseDispute(task_id: string, reason: string): Promise<{ ok: boolean }> {
    return await this.request<{ ok: boolean }>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(task_id)}/dispute`,
      { reason },
    );
  }

  /**
   * Convenience: poll `getTask` until status is complete / disputed / failed /
   * cancelled.
   * Most agent loops want this rather than implementing polling themselves.
   */
  async awaitTask(
    task_id: string,
    opts: AwaitTaskOptions = {},
  ): Promise<TaskState> {
    const poll = opts.pollIntervalMs ?? 2_000;
    const deadline =
      opts.timeoutMs !== undefined ? Date.now() + opts.timeoutMs : Infinity;
    for (;;) {
      const state = await this.getTask(task_id);
      const status = state.task?.status;
      if (status && TERMINAL_STATUSES.has(status)) return state;
      if (Date.now() > deadline) {
        throw new Error(`awaitTask timeout for ${task_id}`);
      }
      await new Promise((r) => setTimeout(r, poll));
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        detail = j.error?.message ?? "";
      } catch {
        detail = await res.text();
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${detail}`);
    }
    return (await res.json()) as T;
  }
}

export function createAuctionClient(
  opts: AuctionClientOptions = {},
): AuctionClient {
  return new AuctionClient(opts);
}
