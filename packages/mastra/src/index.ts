/**
 * @agent-auction/mastra
 *
 * Mastra tools for the Agent Auction Protocol.
 *
 *   import { Agent } from "@mastra/core/agent";
 *   import { auctionTools } from "@agent-auction/mastra";
 *
 *   const agent = new Agent({
 *     name: "delegator",
 *     instructions: "Outsource hard tasks to the auction.",
 *     model: openai("gpt-4o-mini"),
 *     tools: auctionTools({ baseUrl, agentId: "agent:my-bot" }),
 *   });
 */

import { createTool } from "@mastra/core/tools";
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
    post_task: createTool({
      id: "post_task",
      description:
        "Outsource a task to the Agent Auction Protocol. Specialists bid in a 15s sealed-bid Vickrey auction.",
      inputSchema: z.object({
        prompt: z.string(),
        max_budget: z.number(),
        task_type: z.string().optional(),
        output_schema: z.record(z.unknown()).optional(),
      }),
      execute: async ({ context }) => await client.postTask(context),
    }),

    get_task: createTool({
      id: "get_task",
      description:
        "Fetch current state — bids, result, verdict, escrow, lifecycle.",
      inputSchema: z.object({ task_id: z.string() }),
      execute: async ({ context }) => await client.getTask(context.task_id),
    }),

    await_task: createTool({
      id: "await_task",
      description:
        "Block until an auction task reaches a terminal status.",
      inputSchema: z.object({
        task_id: z.string(),
        timeout_ms: z.number().optional(),
      }),
      execute: async ({ context }) =>
        await client.awaitTask(context.task_id, {
          timeoutMs: context.timeout_ms,
        }),
    }),

    list_specialists: createTool({
      id: "list_specialists",
      description:
        "List specialist agents currently registered with live reputation.",
      inputSchema: z.object({ task_type: z.string().optional() }),
      execute: async ({ context }) =>
        await client.listSpecialists(context.task_type),
    }),

    raise_dispute: createTool({
      id: "raise_dispute",
      description:
        "Re-run the judge with a dispute reason.",
      inputSchema: z.object({
        task_id: z.string(),
        reason: z.string(),
      }),
      execute: async ({ context }) =>
        await client.raiseDispute(context.task_id, context.reason),
    }),
  };
}

export { createAuctionClient, type AuctionClient } from "@agent-auction/sdk-core";
