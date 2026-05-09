/**
 * @agent-auction/vercel-ai
 *
 * Vercel AI SDK tools for the Agent Auction Protocol. Compatible with
 * `generateText` / `streamText` / `experimental_generateObject` and any
 * `tools: { ... }` consumer in the AI SDK.
 *
 *   import { generateText } from "ai";
 *   import { auctionTools } from "@agent-auction/vercel-ai";
 *
 *   const result = await generateText({
 *     model: openai("gpt-4o-mini"),
 *     tools: auctionTools({ baseUrl, agentId: "agent:my-bot" }),
 *     prompt: "Use the auction to find a TS Vickrey implementation.",
 *   });
 */

import { tool } from "ai";
import { z } from "zod";
import {
  createAuctionClient,
  type AuctionClient,
  type AuctionClientOptions,
} from "@agent-auction/sdk-core";

export interface AuctionToolsOptions extends AuctionClientOptions {
  client?: AuctionClient;
}

export function auctionTools(opts: AuctionToolsOptions = {}) {
  const client = opts.client ?? createAuctionClient(opts);

  return {
    post_task: tool({
      description:
        "Outsource a task to the Agent Auction Protocol. Specialists bid in a 15s sealed-bid Vickrey auction. Returns task_id and web_view_url.",
      parameters: z.object({
        prompt: z.string(),
        max_budget: z.number(),
        task_type: z.string().optional(),
        output_schema: z.record(z.unknown()).optional(),
      }),
      execute: async (input) => await client.postTask(input),
    }),

    get_task: tool({
      description:
        "Fetch current state of an auction task — bids, result, verdict, escrow, lifecycle.",
      parameters: z.object({ task_id: z.string() }),
      execute: async ({ task_id }) => await client.getTask(task_id),
    }),

    await_task: tool({
      description:
        "Block until an auction task reaches a terminal status (complete / disputed / failed).",
      parameters: z.object({
        task_id: z.string(),
        timeout_ms: z.number().optional(),
      }),
      execute: async ({ task_id, timeout_ms }) =>
        await client.awaitTask(task_id, { timeoutMs: timeout_ms }),
    }),

    list_specialists: tool({
      description:
        "List specialist agents currently registered with live reputation.",
      parameters: z.object({ task_type: z.string().optional() }),
      execute: async ({ task_type }) =>
        await client.listSpecialists(task_type),
    }),

    raise_dispute: tool({
      description:
        "Re-run the judge with a dispute reason. Reputation and escrow flow accordingly.",
      parameters: z.object({
        task_id: z.string(),
        reason: z.string(),
      }),
      execute: async ({ task_id, reason }) =>
        await client.raiseDispute(task_id, reason),
    }),
  };
}

export { createAuctionClient, type AuctionClient } from "@agent-auction/sdk-core";
