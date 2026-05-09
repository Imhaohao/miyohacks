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

export interface PostTaskInput {
  prompt: string;
  max_budget: number;
  task_type?: string;
  output_schema?: Record<string, unknown>;
}

export interface PostTaskResult {
  task_id: string;
  status: "bidding";
  bid_window_closes_at: number;
  web_view_url: string;
}

export interface TaskState {
  task: {
    _id: string;
    status:
      | "bidding"
      | "awarded"
      | "executing"
      | "judging"
      | "complete"
      | "disputed"
      | "failed";
    prompt: string;
    max_budget: number;
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
    bid_price: number;
    score: number;
    capability_claim: string;
    [key: string]: unknown;
  }>;
  escrow: {
    status: "locked" | "released" | "refunded";
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
  cost_baseline: number;
  one_liner: string;
  reputation_score: number;
  total_tasks_completed: number;
}

export interface AwaitTaskOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const TERMINAL_STATUSES = new Set(["complete", "disputed", "failed"]);

export class AuctionClient {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly _fetch: typeof fetch;

  constructor(opts: AuctionClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    this.agentId = opts.agentId ?? "agent:sdk";
    this._fetch = opts.fetch ?? fetch;
  }

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
   * Convenience: poll `getTask` until status is complete / disputed / failed.
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
