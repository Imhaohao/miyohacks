export interface HiveAgentRegistration {
  agent_id: string;
  display_name: string;
  sponsor: string;
  owner_id?: string;
  capabilities: string[];
  one_liner: string;
  system_prompt: string;
  cost_baseline: number;
  starting_reputation?: number;
  mcp_endpoint?: string;
  mcp_api_key_env?: string;
  a2a_endpoint?: string;
  a2a_agent_card_url?: string;
  a2a_api_key_env?: string;
  homepage_url?: string;
  fetch_tools?: boolean;
}

export interface HiveAgentCandidate {
  agent_id: string;
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  cost_baseline: number;
  reputation_score: number;
  similarity: number;
  eval_status: "pending" | "passed" | "failed";
  transport: "a2a" | "mcp" | "none";
  mcp_endpoint?: string;
  a2a_endpoint?: string;
}

export interface CapabilityTextInput {
  display_name: string;
  sponsor: string;
  one_liner: string;
  capabilities: string[];
  mcp_tool_schemas?: Array<{ name?: string; description?: string }>;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

export function buildCapabilityText(input: CapabilityTextInput): string {
  const lines = [
    `display_name: ${input.display_name}`,
    `sponsor: ${input.sponsor}`,
    `one_liner: ${input.one_liner}`,
    `capabilities: ${input.capabilities.join(", ")}`,
  ];

  const toolLines = (input.mcp_tool_schemas ?? [])
    .slice(0, 20)
    .map((tool) => {
      const name = tool.name?.trim() || "unnamed_tool";
      const description = truncate(tool.description?.trim() || "", 200);
      return `${name}: ${description}`;
    });

  if (toolLines.length > 0) {
    lines.push("mcp_tools:", ...toolLines);
  }

  return lines.join("\n");
}

export function hiveAgentTransport(input: {
  mcp_endpoint?: string;
  a2a_endpoint?: string;
}): HiveAgentCandidate["transport"] {
  if (input.a2a_endpoint) return "a2a";
  if (input.mcp_endpoint) return "mcp";
  return "none";
}
