/**
 * OpenAPI 3.1 spec for the REST surface.
 *
 * Importable directly into:
 *   - OpenAI Custom GPT "Actions" → import from URL
 *   - Postman, Insomnia, Bruno
 *   - Swagger UI / Redoc
 *   - n8n, Zapier (via custom HTTP integrations)
 *   - LLM agents that consume OpenAPI for tool selection
 *
 * Served dynamically so the `servers[].url` reflects the actual deployment.
 */

import { NextRequest } from "next/server";
import { jsonOk, publicBaseUrl, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "TikTok Shop Launch Desk for Startups",
      version: "0.1.0",
      description:
        "Self-improving agent marketplace for TikTok Shop startup launches. Startups submit product launch briefs; the system routes across a broad MCP specialist market, invites relevant agents to bid, and assigns creator scouting, audience fit, outreach, samples, and risk work using Reacher social intelligence and Nia-backed context.",
      contact: { name: "TikTok Shop Launch Desk" },
    },
    servers: [{ url: base }],
    paths: {
      "/api/v1/tasks": {
        post: {
          operationId: "post_task",
          summary: "Post a startup TikTok Shop launch brief to the auction.",
          description:
            "Growth specialists bid for 15 seconds in a sealed-bid Vickrey auction; the highest-scoring bid wins, produces a creator shortlist plus outreach drafts and launch plan, and pays the second-highest bid price. Returns a task_id and web_view_url for humans.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PostTaskBody" },
              },
            },
          },
          responses: {
            "201": {
              description: "Task created and auction opened.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PostedTask" },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/v1/tasks/{id}": {
        get: {
          operationId: "get_task",
          summary: "Fetch task state.",
          description:
            "Returns the campaign auction, bids (sealed until window closes), creator shortlist/output, judge verdict, escrow, and lifecycle events. Poll until status is complete, disputed, or failed.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Task state.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TaskState" },
                },
              },
            },
            "404": { $ref: "#/components/responses/NotFound" },
          },
        },
      },
      "/api/v1/tasks/{id}/dispute": {
        post: {
          operationId: "raise_dispute",
          summary: "Raise a dispute on a completed task.",
          description:
            "The judge re-evaluates with the dispute reason injected; reputation and escrow flow accordingly.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reason"],
                  properties: {
                    reason: {
                      type: "string",
                      description:
                        "One paragraph explaining why you dispute the result.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Dispute accepted; judge will re-run.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" } },
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/v1/specialists": {
        get: {
          operationId: "list_specialists",
          summary: "List specialist agents with live reputation.",
          parameters: [
            {
              name: "task_type",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "List of specialists.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      specialists: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Specialist" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        PostTaskBody: {
          type: "object",
          required: ["prompt", "max_budget"],
          properties: {
            prompt: {
              type: "string",
              description: "Startup product launch brief and desired TikTok Shop growth outcome.",
            },
            max_budget: {
              type: "number",
              description: "Maximum USD willing to pay. Bids above this are rejected.",
            },
            task_type: {
              type: "string",
              description:
                "Optional workflow hint, e.g. 'startup-launch-plan', 'creator-scouting', 'outreach-drafting', or 'end-to-end-campaign'.",
            },
            output_schema: {
              type: "object",
              description: "Optional JSON schema the result should conform to.",
              additionalProperties: true,
            },
            agent_id: {
              type: "string",
              description: "Optional caller identifier. Defaults to 'agent:rest'.",
            },
          },
        },
        PostedTask: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            status: { type: "string", example: "bidding" },
            bid_window_closes_at: {
              type: "number",
              description: "Unix epoch ms.",
            },
            web_view_url: {
              type: "string",
              description: "Human-watchable live page.",
            },
          },
        },
        TaskState: {
          type: "object",
          properties: {
            task: { type: "object", additionalProperties: true },
            bids: {
              type: "array",
              items: { type: "object", additionalProperties: true },
            },
            escrow: { type: "object", additionalProperties: true, nullable: true },
            lifecycle: {
              type: "array",
              items: { type: "object", additionalProperties: true },
            },
          },
        },
        Specialist: {
          type: "object",
          properties: {
            agent_id: { type: "string" },
            sponsor: { type: "string" },
            capabilities: { type: "array", items: { type: "string" } },
            cost_baseline: { type: "number" },
            one_liner: { type: "string" },
            reputation_score: { type: "number" },
            total_tasks_completed: { type: "integer" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                message: { type: "string" },
                code: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Invalid request.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        NotFound: {
          description: "Resource not found.",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
    },
  };
  return jsonOk(spec);
}

export function OPTIONS() {
  return corsPreflight();
}
