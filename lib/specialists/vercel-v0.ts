// Specialist: vercel-v0 (powered by the real v0 API when V0_API_KEY is set).
// Without credentials it declines, so Arbor never presents mocked v0 output as
// a real Vercel/v0 result.

import type {
  BidPayload,
  DeclineDecision,
  SpecialistConfig,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";
import { buildTaskContext } from "../campaign-context";

const V0_API_URL = "https://api.v0.dev/v1/chats";

export const VERCEL_V0_CONFIG: SpecialistConfig = {
  agent_id: "vercel-v0",
  display_name: "vercel-v0",
  sponsor: "Vercel (v0)",
  capabilities: [
    "frontend-prototyping",
    "pricing-page-design",
    "dashboard-ui",
    "react-tailwind-ui",
  ],
  cost_baseline: 0.35,
  starting_reputation: 0.6,
  one_liner:
    "Calls the real v0 API to generate React/Tailwind UI artifacts when V0_API_KEY is configured.",
  system_prompt: `You are vercel-v0, the Vercel/v0 specialist agent. Your strength is producing shippable frontend artifacts: pricing pages, dashboards, product flows, React/Tailwind component sketches, and Vercel-ready UI plans. Preserve existing design systems and deployment constraints. Do not pivot unrelated tasks into creator campaigns.`,
  homepage_url: "https://v0.app",
  mcp_api_key_env: "V0_API_KEY",
  is_verified: Boolean(process.env.V0_API_KEY),
};

type V0ChatResponse = {
  id?: string;
  webUrl?: string;
  web_url?: string;
  latestVersion?: {
    id?: string;
    files?: Array<{ name?: string; content?: string }>;
  };
  latest_version?: {
    id?: string;
    files?: Array<{ name?: string; content?: string }>;
  };
  files?: Array<{ name?: string; content?: string }>;
  text?: string;
  error?: unknown;
};

function v0Key() {
  return process.env.V0_API_KEY?.trim();
}

function isFrontendTask(prompt: string, taskType: string) {
  const text = `${prompt} ${taskType}`.toLowerCase();
  return [
    "landing page",
    "pricing page",
    "dashboard",
    "frontend",
    "react",
    "tailwind",
    "ui",
    "component",
    "website",
    "web app",
    "hero",
    "cta",
  ].some((needle) => text.includes(needle));
}

function decline(reason: string): DeclineDecision {
  return { decline: true, reason };
}

async function createV0Chat(prompt: string, taskType: string) {
  const key = v0Key();
  if (!key) {
    throw new Error("V0_API_KEY is not set");
  }

  const response = await fetch(V0_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: `${buildTaskContext(prompt, taskType)}

Return production-ready React/Tailwind UI. If this is a landing page, include concrete hero copy, CTA text, section structure, and visual direction. If this is a product UI, include component structure and implementation notes.`,
      system: VERCEL_V0_CONFIG.system_prompt,
    }),
  });

  const text = await response.text();
  let data: V0ChatResponse;
  try {
    data = text ? (JSON.parse(text) as V0ChatResponse) : {};
  } catch {
    data = { text };
  }

  if (!response.ok) {
    throw new Error(
      `v0 API error ${response.status}: ${text.slice(0, 300) || response.statusText}`,
    );
  }

  return data;
}

function summarizeV0Response(data: V0ChatResponse) {
  const webUrl = data.webUrl ?? data.web_url;
  const version = data.latestVersion ?? data.latest_version;
  const files = data.files ?? version?.files ?? [];
  const fileList = files
    .map((file) => file.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 8);
  const codePreview = files
    .map((file) => file.content)
    .find((content): content is string => Boolean(content?.trim()))
    ?.slice(0, 1400);

  return [
    "# v0 generation",
    "",
    webUrl ? `Open in v0: ${webUrl}` : "v0 returned a chat without a web URL.",
    data.id ? `Chat id: ${data.id}` : null,
    version?.id ? `Version id: ${version.id}` : null,
    fileList.length ? `Files: ${fileList.join(", ")}` : null,
    codePreview ? `\n## Code preview\n\n\`\`\`tsx\n${codePreview}\n\`\`\`` : null,
    data.text ? `\n## v0 text\n\n${data.text}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const vercelV0: SpecialistRunner = {
  config: VERCEL_V0_CONFIG,

  async bid(prompt, taskType): Promise<BidPayload | DeclineDecision> {
    if (!v0Key()) {
      return decline("V0_API_KEY is not configured, so real v0 generation is unavailable.");
    }
    if (!isFrontendTask(prompt, taskType)) {
      return decline("v0 is a frontend/UI generation specialist; this task is not a UI build.");
    }
    return {
      bid_price: VERCEL_V0_CONFIG.cost_baseline,
      capability_claim:
        "I will call the real v0 API to generate a React/Tailwind UI artifact with concrete copy, layout, CTA, and implementation-ready component structure.",
      estimated_seconds: 900,
    };
  },

  async execute(prompt, taskType): Promise<SpecialistOutput> {
    const data = await createV0Chat(prompt, taskType);
    return summarizeV0Response(data);
  },
};
