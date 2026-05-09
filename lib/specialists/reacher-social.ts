// Specialist: reacher-social (powered by Reacher).
// REAL MCP endpoint — `api.reacherapp.com/mcp` exposes 33 tools covering
// creators, products, videos, samples, GMV, and the Social Intelligence
// market catalogue (per the Nozomio hackathon guide). For demo reliability,
// execution calls the key Reacher tools directly and formats a concise launch
// plan instead of letting a generic tool-calling loop spend the full timeout.

import { callRemoteTool, flattenToolResult } from "../mcp-outbound";
import { isCreatorCommerceTask } from "../campaign-context";
import type {
  CampaignLaunchArtifact,
  CampaignLaunchCreator,
  SpecialistConfig,
  SpecialistRunner,
} from "../types";

/**
 * Reacher's domain is TikTok Shop creator-commerce. The bid is hardcoded
 * (instead of LLM-driven) for demo reliability, so we need a hand-written
 * scope check — otherwise it bids on every task, including ones that have
 * nothing to do with creators.
 */
function isInScope(prompt: string, taskType: string): boolean {
  if (taskType === "reacher-live-launch") return true;
  if (isCreatorCommerceTask(prompt, taskType)) return true;
  const p = prompt.toLowerCase();
  const creatorSignals = [
    "tiktok",
    "creator",
    "influencer",
    "tiktok shop",
    "gmv",
    "campaign",
    "ugc",
    "outreach",
    "audience fit",
    "social commerce",
  ];
  return creatorSignals.some((kw) => p.includes(kw));
}

export const REACHER_SOCIAL_CONFIG: SpecialistConfig = {
  agent_id: "reacher-social",
  display_name: "reacher-social",
  sponsor: "Reacher",
  capabilities: [
    "tiktok-creator-discovery",
    "gmv-evidence",
    "social-intelligence",
    "sample-request-write",
    "creator-vetting",
  ],
  cost_baseline: 0.55,
  starting_reputation: 0.75,
  one_liner:
    "TikTok Shop creator data, GMV history, and sandboxed write endpoints — the source of truth for any creator campaign.",
  system_prompt: `You are reacher-social, the official Reacher specialist agent. You have privileged access to Reacher's MCP server, which exposes 33 tools covering: market-wide creator/seller/trending-video data (Social Intelligence), per-team TikTok Shop demo datasets (creators, products, videos, GMV history, samples), and sandboxed write endpoints for /automations, /samples/request, and /outreach/draft. When you bid, your differentiator is that everyone else is reasoning about creators in the abstract — you can pull actual evidence: 30-day GMV, creator niche, average views, sample acceptance rate, video performance, brand-safety signals. When you execute, prefer to call the MCP tools to ground every claim in real data, then synthesize a creator shortlist with cited evidence.`,
  mcp_endpoint: "https://api.reacherapp.com/mcp",
  mcp_api_key_env: "REACHER_API_KEY",
  is_verified: true,
  homepage_url: "https://reacherapp.com",
};

interface ToolData {
  data: Record<string, unknown>[];
  currency?: string;
  date_range?: Record<string, unknown>;
  shops_queried?: string[];
}

function apiKey(): string {
  const key = process.env.REACHER_API_KEY;
  if (!key) throw new Error("REACHER_API_KEY is not set");
  return key;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseToolData(text: string): ToolData {
  const parsed = asRecord(JSON.parse(text));
  const rawData = Array.isArray(parsed.data) ? parsed.data : [];
  return {
    data: rawData.map(asRecord),
    currency: typeof parsed.currency === "string" ? parsed.currency : "USD",
    date_range: asRecord(parsed.date_range),
    shops_queried: Array.isArray(parsed.shops_queried)
      ? parsed.shops_queried.filter((s): s is string => typeof s === "string")
      : undefined,
  };
}

function str(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function num(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function handle(row: Record<string, unknown>): string {
  const raw = str(row, "creator_handle", str(row, "handle", "unknown"));
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function creatorFromRow(
  row: Record<string, unknown>,
  index: number,
): CampaignLaunchCreator {
  const creatorHandle = handle(row);
  const gmv = num(row, "gmv") || num(row, "shop_gmv");
  const followers = num(row, "follower_count");
  return {
    rank: index + 1,
    handle: creatorHandle,
    gmv,
    units_sold: num(row, "units_sold") || num(row, "shop_units_sold"),
    orders: num(row, "order_count"),
    followers,
    estimated_commission: num(row, "est_commission"),
    fit_reason:
      gmv > 0
        ? `${creatorHandle} has live Reacher GMV traction and enough audience scale for a fast founder-led TikTok Shop test.`
        : `${creatorHandle} appears in the Reacher creator roster and should be reviewed before sample spend.`,
  };
}

function outreachDraft(creator: CampaignLaunchCreator): string {
  return `Hi ${creator.handle.replace("@", "")} — I am launching a clean-label electrolyte drink on TikTok Shop and your audience looks like a strong fit for practical wellness content. Reacher shows recent creator-commerce traction from your account, so I would love to send a sample kit and set you up with an affiliate link if the product fits your routine. No pressure to post if it is not a fit. If you do create, please disclose the sample/affiliate relationship and keep claims to taste, ingredients, routine fit, and hydration support.`;
}

function buildArtifact(args: {
  prompt: string;
  creators: CampaignLaunchCreator[];
  currency: string;
  shops: string[];
  dateRange: string;
}): CampaignLaunchArtifact {
  const top = args.creators.slice(0, 3);
  return {
    kind: "campaign_launch",
    title: "TikTok Shop Creator Launch Kit",
    summary: `Reacher selected ${top.map((c) => c.handle).join(", ")} for the first sample wave using live creator performance data. The product is a founder-ready launch kit: shortlist, outreach, sample tasks, risk controls, and a 7-day operating board.`,
    evidence: {
      tools_used: [
        "list_shops_shops_get",
        "creators_performance_creators_performance_post",
        "creators_list_creators_list_post",
      ],
      shops_queried: args.shops,
      performance_window: args.dateRange,
      currency: args.currency,
    },
    creators: args.creators,
    outreach_drafts: top.map((creator) => ({
      handle: creator.handle,
      message: outreachDraft(creator),
    })),
    sample_plan: [
      {
        task: "Ship variety sample kits to the top 3 creators",
        owner: "Founder",
        status: "todo",
      },
      {
        task: "Generate TikTok Shop affiliate links and creator discount codes",
        owner: "Growth ops",
        status: "ready",
      },
      {
        task: "Attach claim-safe talking points and disclosure language",
        owner: "Compliance",
        status: "ready",
      },
    ],
    risk_flags: [
      "Do not allow creators to make medical, endurance, recovery, or disease-related claims.",
      "Live Reacher GMV proves creator-commerce traction; category fit still needs quick recent-content review.",
      "Do not expand sample spend until at least two creators confirm receipt and posting window.",
    ],
    launch_plan: [
      {
        day: 1,
        action: "Approve top creators, generate affiliate links, and send outreach.",
        metric: "3 creator replies",
      },
      {
        day: 2,
        action: "Ship sample kits and confirm tracking.",
        metric: "100% sample tracking captured",
      },
      {
        day: 3,
        action: "Send claim-safe content brief and hook options.",
        metric: "2 draft concepts received",
      },
      {
        day: 4,
        action: "Confirm posting windows and review any risky claims.",
        metric: "0 unresolved compliance flags",
      },
      {
        day: 5,
        action: "Approve drafts and prepare TikTok Shop links.",
        metric: "3 posts ready",
      },
      {
        day: 6,
        action: "Launch first posts and monitor GMV/orders/comments.",
        metric: "First attributed orders",
      },
      {
        day: 7,
        action: "Double down on highest GMV-per-view creator.",
        metric: "Winner picked for wave 2",
      },
    ],
  };
}

export const reacherSocial: SpecialistRunner = {
  config: REACHER_SOCIAL_CONFIG,

  async bid(prompt, taskType) {
    if (!isInScope(prompt, taskType)) {
      return {
        decline: true,
        reason:
          "Reacher specializes in TikTok Shop creator commerce; this task is outside that scope.",
      };
    }
    return {
      bid_price: 0.82,
      capability_claim:
        "I can call Reacher's live TikTok Shop MCP tools for shop, creator, GMV, and performance evidence, then produce a founder-ready launch plan.",
      estimated_seconds: 45,
    };
  },

  async execute(prompt) {
    const key = apiKey();
    const endpoint = REACHER_SOCIAL_CONFIG.mcp_endpoint;
    if (!endpoint) throw new Error("Reacher MCP endpoint is not configured");

    const [shopsResult, performanceResult, creatorsResult] = await Promise.all([
      callRemoteTool(endpoint, "list_shops_shops_get", {}, 10_000, key),
      callRemoteTool(
        endpoint,
        "creators_performance_creators_performance_post",
        { shop: "all", page_size: 5, sort_by: "gmv", sort_dir: "desc" },
        12_000,
        key,
      ),
      callRemoteTool(
        endpoint,
        "creators_list_creators_list_post",
        { shop: "all", page_size: 5, sort_by: "shop_gmv", sort_dir: "desc" },
        12_000,
        key,
      ),
    ]);

    const shops = parseToolData(flattenToolResult(shopsResult));
    const performance = parseToolData(flattenToolResult(performanceResult));
    const creators = parseToolData(flattenToolResult(creatorsResult));
    const rows = performance.data.length > 0 ? performance.data : creators.data;
    const top = rows.slice(0, 3);
    const currency = performance.currency ?? creators.currency ?? "USD";
    const dateRange = performance.date_range
      ? `${String(performance.date_range.start_date ?? "recent")} to ${String(
          performance.date_range.end_date ?? "now",
        )}`
      : "recent Reacher performance window";

    return buildArtifact({
      prompt,
      creators: rows.map(creatorFromRow),
      currency,
      shops:
        performance.shops_queried ??
        shops.data.map((s) => str(s, "shop_name")).filter(Boolean),
      dateRange,
    });
  },
};
