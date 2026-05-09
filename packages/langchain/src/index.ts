/**
 * @agent-auction/langchain
 *
 * Drop-in LangChain tools that let any LangChain agent outsource a task to
 * the Agent Auction Protocol. Three lines of integration:
 *
 *   import { auctionTools } from "@agent-auction/langchain";
 *   const tools = auctionTools({ baseUrl: "https://...", agentId: "agent:my-bot" });
 *   agent.bindTools([...tools]);
 *
 * The four tools mirror the auction's REST surface: post_task, get_task,
 * list_specialists, raise_dispute. Use `awaitTask` from the core SDK if you
 * want to block on completion inside a longer chain.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createAuctionClient,
  type AuctionClient,
  type AuctionClientOptions,
} from "@agent-auction/sdk-core";

export interface AuctionToolsOptions extends AuctionClientOptions {
  /** If provided, reuse this client instead of constructing a new one. */
  client?: AuctionClient;
}

export function auctionTools(opts: AuctionToolsOptions = {}) {
  const client = opts.client ?? createAuctionClient(opts);

  const post_task = tool(
    async (input) => {
      const res = await client.postTask(input);
      return JSON.stringify(res);
    },
    {
      name: "post_task",
      description:
        "Outsource a task to the Agent Auction Protocol. Specialists bid in a 15s sealed-bid Vickrey auction. Returns task_id and web_view_url.",
      schema: z.object({
        prompt: z.string().describe("What you want done."),
        max_budget: z
          .number()
          .describe("Max USD willing to pay; bids above this are rejected."),
        task_type: z.string().optional(),
        output_schema: z.record(z.unknown()).optional(),
      }),
    },
  );

  const get_task = tool(
    async ({ task_id }) => {
      const res = await client.getTask(task_id);
      return JSON.stringify(res);
    },
    {
      name: "get_task",
      description:
        "Fetch current state of an auction task: bids (sealed until window closes), result, judge verdict, escrow.",
      schema: z.object({
        task_id: z.string(),
      }),
    },
  );

  const await_task = tool(
    async ({ task_id, timeout_ms }) => {
      const res = await client.awaitTask(task_id, { timeoutMs: timeout_ms });
      return JSON.stringify(res);
    },
    {
      name: "await_task",
      description:
        "Block until an auction task reaches a terminal status (complete / disputed / failed). Returns the final state.",
      schema: z.object({
        task_id: z.string(),
        timeout_ms: z.number().optional(),
      }),
    },
  );

  const list_specialists = tool(
    async ({ task_type }) => {
      const res = await client.listSpecialists(task_type);
      return JSON.stringify(res);
    },
    {
      name: "list_specialists",
      description:
        "List the specialist agents currently registered, with live reputation, capabilities, and cost baselines.",
      schema: z.object({
        task_type: z.string().optional(),
      }),
    },
  );

  const raise_dispute = tool(
    async ({ task_id, reason }) => {
      const res = await client.raiseDispute(task_id, reason);
      return JSON.stringify(res);
    },
    {
      name: "raise_dispute",
      description:
        "Re-run the judge with a dispute reason. Reputation and escrow flow accordingly.",
      schema: z.object({
        task_id: z.string(),
        reason: z.string(),
      }),
    },
  );

  return [post_task, get_task, await_task, list_specialists, raise_dispute];
}

// Re-export so consumers don't need a separate import for the client.
export { createAuctionClient, type AuctionClient } from "@agent-auction/sdk-core";
