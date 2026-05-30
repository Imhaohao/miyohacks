// Specialist: vercel-v0 (powered by the real v0 API when V0_API_KEY is set).
// Without credentials it declines, so Arbor never presents mocked v0 output as
// a real Vercel/v0 result.

import type {
  BidPayload,
  DeclineDecision,
  ProbeResult,
  SpecialistConfig,
  SpecialistOutput,
  SpecialistRunner,
  SpecialistExecuteResult,
  SpecialistProvenance,
} from "../types";
import { buildTaskContext } from "../campaign-context";
import { toPublicTier } from "./tiers";

const V0_API_URL = "https://api.v0.dev/v1/chats";
const V0_POLL_TIMEOUT_MS = 120_000;
const V0_POLL_INTERVAL_MS = 3_000;

export const VERCEL_V0_CONFIG: SpecialistConfig = {
  agent_id: "vercel-v0",
  tier: "real",
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

type V0File = {
  name?: string;
  content?: string;
  source?: string;
  meta?: { file?: string };
};

type V0ChatResponse = {
  id?: string;
  webUrl?: string;
  web_url?: string;
  latestVersion?: {
    id?: string;
    status?: string;
    demoUrl?: string;
    demo_url?: string;
    screenshotUrl?: string;
    screenshot_url?: string;
    files?: V0File[];
  };
  latest_version?: {
    id?: string;
    status?: string;
    demoUrl?: string;
    demo_url?: string;
    screenshotUrl?: string;
    screenshot_url?: string;
    files?: V0File[];
  };
  files?: V0File[];
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

  return await pollV0Chat(data, key);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function versionOf(data: V0ChatResponse) {
  return data.latestVersion ?? data.latest_version;
}

function filesOf(data: V0ChatResponse): V0File[] {
  return data.files ?? versionOf(data)?.files ?? [];
}

function demoUrlOf(data: V0ChatResponse): string | undefined {
  const version = versionOf(data);
  return version?.demoUrl ?? version?.demo_url;
}

function hasCompletedV0Payload(data: V0ChatResponse) {
  const version = versionOf(data);
  const status = version?.status?.toLowerCase();
  return (
    filesOf(data).some((file) => fileContent(file).trim()) ||
    Boolean(demoUrlOf(data)) ||
    status === "completed"
  );
}

async function fetchV0Chat(chatId: string, key: string): Promise<V0ChatResponse> {
  const response = await fetch(`${V0_API_URL}/${chatId}`, {
    headers: { authorization: `Bearer ${key}` },
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
      `v0 API polling error ${response.status}: ${text.slice(0, 300) || response.statusText}`,
    );
  }
  return data;
}

async function pollV0Chat(initial: V0ChatResponse, key: string) {
  if (!initial.id || hasCompletedV0Payload(initial)) {
    return initial;
  }

  const deadline = Date.now() + V0_POLL_TIMEOUT_MS;
  let latest = initial;
  while (Date.now() < deadline) {
    await sleep(V0_POLL_INTERVAL_MS);
    latest = await fetchV0Chat(initial.id, key);
    if (hasCompletedV0Payload(latest)) {
      return latest;
    }
  }
  return latest;
}

function fileName(file: V0File): string {
  return file.name ?? file.meta?.file ?? "generated-file";
}

function fileContent(file: V0File): string {
  return file.content ?? file.source ?? "";
}

function filePriority(file: V0File): number {
  const name = fileName(file);
  if (name === "app/page.tsx") return 0;
  if (/tic-tac-toe|game|board|cell|status|player|hook/i.test(name)) return 1;
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return 2;
  if (name === "lib/utils.ts" || name === "utils.ts") return 3;
  if (name === "package.json") return 4;
  return 5;
}

function summarizeV0Response(data: V0ChatResponse) {
  const webUrl = data.webUrl ?? data.web_url;
  const version = versionOf(data);
  const demoUrl = demoUrlOf(data);
  const screenshotUrl = version?.screenshotUrl ?? version?.screenshot_url;
  const files = filesOf(data);
  const fileList = files
    .map(fileName)
    .filter((name): name is string => Boolean(name))
    .slice(0, 12);
  const sortedFiles = [...files].sort((a, b) => filePriority(a) - filePriority(b));
  const sourceSections = sortedFiles
    .map((file) => {
      const content = fileContent(file).trim();
      if (!content) return null;
      const name = fileName(file);
      const lang = name.endsWith(".css")
        ? "css"
        : name.endsWith(".json")
          ? "json"
          : name.endsWith(".tsx") || name.endsWith(".ts")
            ? "tsx"
            : "";
      return `### ${name}\n\n\`\`\`${lang}\n${content.slice(0, 8000)}\n\`\`\``;
    })
    .filter((section): section is string => Boolean(section))
    .slice(0, 16);
  const combinedSource = files.map(fileContent).join("\n");
  const fileNames = new Set(files.map(fileName));
  if (
    combinedSource.includes("@/lib/utils") &&
    !fileNames.has("lib/utils.ts") &&
    !fileNames.has("lib/utils.tsx")
  ) {
    sourceSections.push(`### lib/utils.ts (compatibility helper)

\`\`\`ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
\`\`\``);
  }

  return [
    "# v0 generation",
    "",
    webUrl ? `Open in v0: ${webUrl}` : "v0 returned a chat without a web URL.",
    demoUrl ? `Demo URL: ${demoUrl}` : null,
    screenshotUrl ? `Screenshot: ${screenshotUrl}` : null,
    data.id ? `Chat id: ${data.id}` : null,
    version?.id ? `Version id: ${version.id}` : null,
    version?.status ? `Version status: ${version.status}` : null,
    fileList.length ? `Files: ${fileList.join(", ")}` : null,
    sourceSections.length ? `\n## Generated source\n\n${sourceSections.join("\n\n")}` : null,
    data.text ? `\n## v0 text\n\n${data.text}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const vercelV0: SpecialistRunner = {
  config: VERCEL_V0_CONFIG,

  async probe(_taskType: string): Promise<ProbeResult> {
    const t0 = Date.now();
    const key = v0Key();
    if (!key) {
      return {
        status: "fail",
        duration_ms: Date.now() - t0,
        error_message: "V0_API_KEY is not set",
      };
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(V0_API_URL, {
        headers: { authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(id);
      return {
        status: "fail",
        duration_ms: Date.now() - t0,
        error_message: err instanceof Error ? err.message : String(err),
      };
    }
    clearTimeout(id);
    const duration_ms = Date.now() - t0;
    if (response.status >= 500) {
      return {
        status: "fail",
        duration_ms,
        error_message: `v0 server error ${response.status}`,
      };
    }
    const body = await response.text().catch(() => "");
    return {
      status: "pass",
      duration_ms,
      response_excerpt: `status=${response.status}; ${body.slice(0, 260)}`.slice(0, 300),
    };
  },

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

  async execute(prompt, taskType): Promise<SpecialistExecuteResult> {
    const data = await createV0Chat(prompt, taskType);
    const output: SpecialistOutput = summarizeV0Response(data);
    const provenance: SpecialistProvenance = {
      tier: toPublicTier(VERCEL_V0_CONFIG.tier),
      live_tools_called: true,
      transport: "api",
      proof_level: "api_call",
      external_task_id: data.id,
      endpoint: V0_API_URL,
    };
    return { output, provenance };
  },
};
