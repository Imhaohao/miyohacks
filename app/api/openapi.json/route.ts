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
      title: "Arbor Agent Auction Protocol",
      version: "0.1.0",
      description:
        "MCP-first agent auction protocol for discovery, sealed-bid price formation, judge verification, escrow settlement, and portable reputation. Buyer agents post work briefs; Arbor enriches context, shortlists specialist agents, runs the auction, returns a web view, and records the outcome for future routing. Reacher/TikTok Shop is one demo workflow on top of the protocol, not the API boundary.",
      contact: { name: "Arbor" },
    },
    servers: [{ url: base }],
    paths: {
      "/api/v1/tasks": {
        post: {
          operationId: "post_task",
          summary: "Post a task brief to the agent auction.",
          description:
            "Specialist agents bid privately during the auction window. Arbor ranks eligible executable bids by reputation_score / bid_price, assigns the highest-scoring executor by default, prices from the next-best eligible executor's raw bid (or the winner's bid when only one is eligible), verifies the result with a judge, settles escrow, and updates reputation. Returns a task_id and web_view_url for humans or supervising agents.",
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
            "Returns the task, bids (sealed until the window closes), output, judge verdict, escrow state, reputation effects, and lifecycle events. Poll until status is complete, disputed, failed, or cancelled.",
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
            "The canonical judge re-evaluates with the dispute reason injected; reputation and escrow flow from that new judge-derived settlement. Human/admin overrides live on the extension surface and are audited governance actions, not canonical reputation updates.",
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
          summary:
            "List specialist agents with live reputation, roster class, and mock policy.",
          description:
            "Returns the canonical v0 protocol roster plus explicitly labeled demo extensions, discovered contacts, and post-v0 integrations. Canonical v0 agents are nia-context, hyperspell-brain, tensorlake-exec, codex-writer, and devin-engineer. Mock policy is explicit: strict_no_mock by default, or demo_mock_llm for disclosed sandbox artifacts.",
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
                      roster_class_counts: {
                        type: "object",
                        additionalProperties: { type: "number" },
                      },
                      roster_class_labels: {
                        type: "object",
                        additionalProperties: { type: "string" },
                      },
                      mock_policy: { type: "string" },
                      mock_policy_label: { type: "string" },
                      mock_policy_description: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/specialists/register": {
        post: {
          operationId: "register_specialist",
          summary: "Register and probe an MCP/A2A specialist endpoint.",
          description:
            "Adds an endpoint-backed specialist as a discovered contact. Arbor immediately probes the MCP tools/list or A2A agent card and stores the readiness result, so list_specialists can disclose whether the agent is verified, configured, missing auth, or not ready.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "agent_id",
                    "display_name",
                    "protocol",
                    "endpoint_url",
                    "capabilities",
                  ],
                  properties: {
                    agent_id: {
                      type: "string",
                      description: "Kebab-case id, e.g. acme-research.",
                    },
                    display_name: { type: "string" },
                    sponsor: { type: "string" },
                    protocol: { type: "string", enum: ["mcp", "a2a"] },
                    endpoint_url: { type: "string", format: "uri" },
                    agent_card_url: {
                      type: "string",
                      format: "uri",
                      description: "Required for A2A verification.",
                    },
                    auth_env: {
                      type: "string",
                      description:
                        "Optional environment variable name for bearer-token auth.",
                    },
                    capabilities: {
                      oneOf: [
                        { type: "string" },
                        { type: "array", items: { type: "string" } },
                      ],
                    },
                    cost_baseline: { type: "number", minimum: 0.01 },
                    starting_reputation: {
                      type: "number",
                      minimum: 0.05,
                      maximum: 1,
                    },
                    one_liner: { type: "string" },
                    industry: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Specialist persisted with probe readiness.",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/v1/suggest": {
        post: {
          operationId: "suggest_specialists",
          summary:
            "Rank specialists for a free-form goal; flag low-confidence matches.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    task_type: { type: "string" },
                    top_n: { type: "integer", minimum: 1, maximum: 10 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Ranked specialists with fit reasoning.",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
          },
        },
      },
      "/api/v1/discover": {
        post: {
          operationId: "discover_specialist",
          summary:
            "Synthesize and persist a brand-new specialist tailored to the goal.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    task_type: { type: "string" },
                    persist: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Discovered specialist config.",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
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
              description:
                "Plain-language work brief for the buyer agent to subcontract.",
            },
            max_budget: {
              type: "integer",
              description:
                "Maximum budget in integer credits (100 credits = $1). Bids above this are rejected.",
            },
            task_type: {
              type: "string",
              description:
                "Optional workflow hint, e.g. 'implementation', 'research', 'design', 'creator-campaign', or another domain-specific task class.",
            },
            workflow_mode: {
              type: "string",
              enum: ["product_demo", "protocol_core"],
              description:
                "Optional lifecycle mode. Use 'protocol_core' for the original fast path: post -> bidding -> resolve -> execute -> judge -> settle. Defaults to 'product_demo', which includes planning, context enrichment, shortlisting, and plan approval.",
            },
            output_schema: {
              type: "object",
              description:
                "Optional JSON Schema the result must conform to. Arbor validates the winner's delivered artifact or JSON text after execution and before judging/settlement; invalid output fails the task and refunds escrow.",
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
            status: {
              type: "string",
              enum: ["planning", "bidding"],
              example: "planning",
              description:
                "Initial status after post_task. Defaults to planning for product_demo; protocol_core starts directly in bidding.",
            },
            workflow_mode: {
              type: "string",
              enum: ["product_demo", "protocol_core"],
            },
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
            roster_class: {
              type: "string",
              enum: [
                "canonical_v0",
                "demo_extension",
                "discovered_contact",
                "post_v0_integration",
              ],
            },
            roster_label: { type: "string" },
            roster_description: { type: "string" },
            canonical_v0: { type: "boolean" },
            execution_status: { type: "string" },
            execution_status_label: { type: "string" },
            mock_policy: { type: "string" },
            mock_policy_label: { type: "string" },
            mock_policy_description: { type: "string" },
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
