export interface ReacherCreatorSignal {
  handle: string;
  niche: string;
  audienceFit: number;
  gmv30d: number;
  avgVideoViews: number;
  sampleAcceptanceRate: number;
  risk: "low" | "medium" | "high";
  evidence: string[];
}

export const DEFAULT_CAMPAIGN_BRIEF =
  "Launch a TikTok Shop creator campaign for a clean-label electrolyte drink targeting wellness creators, college athletes, and busy professionals. Find creators with credible GMV signals, strong audience fit, and low brand-safety risk. Produce a shortlist, outreach drafts, sample-request notes, and risk rationale.";

export const REACHER_DEMO_SIGNALS: ReacherCreatorSignal[] = [
  {
    handle: "@hydrationhaley",
    niche: "wellness routines",
    audienceFit: 0.92,
    gmv30d: 18420,
    avgVideoViews: 74200,
    sampleAcceptanceRate: 0.71,
    risk: "low",
    evidence: [
      "3 electrolyte videos crossed $4k attributed GMV in the last 30 days",
      "Audience comments skew toward low-sugar hydration and marathon prep",
      "No recent brand-safety flags in Reacher video catalogue",
    ],
  },
  {
    handle: "@campusfuel",
    niche: "college fitness",
    audienceFit: 0.87,
    gmv30d: 12980,
    avgVideoViews: 51800,
    sampleAcceptanceRate: 0.64,
    risk: "medium",
    evidence: [
      "High engagement on dorm-room workout and study-night snack content",
      "GMV spikes around back-to-school bundles and creator discount codes",
      "One disputed sample shipment in demo account history",
    ],
  },
  {
    handle: "@deskfitdaily",
    niche: "busy professional health",
    audienceFit: 0.81,
    gmv30d: 9360,
    avgVideoViews: 38900,
    sampleAcceptanceRate: 0.78,
    risk: "low",
    evidence: [
      "Strong saves on 'healthy office drawer' videos",
      "Audience overlaps with productivity and low-caffeine wellness tags",
      "Consistent fulfillment follow-through across 6 prior sample requests",
    ],
  },
  {
    handle: "@viralvarietyshop",
    niche: "general deals",
    audienceFit: 0.43,
    gmv30d: 31100,
    avgVideoViews: 110000,
    sampleAcceptanceRate: 0.38,
    risk: "high",
    evidence: [
      "Large GMV but weak category fit for clean-label wellness",
      "Recent videos include unrelated discount electronics and novelty snacks",
      "Two brand-safety cautions for exaggerated product claims",
    ],
  },
];

const NIA_CONTEXT = [
  "Nia campaign memory: previous hydration launches won when creators had a niche fit score above 0.80 and explicit low-sugar audience language.",
  "Nia brief index: brand voice should be practical, evidence-led, and avoid medical claims.",
  "Nia risk note: outreach must include a sample request, a creator-specific hook, and a disclosure-safe ask.",
];

export function buildCampaignEvidence(prompt: string, taskType: string): string {
  const creatorRows = REACHER_DEMO_SIGNALS.map((c) =>
    [
      `${c.handle} (${c.niche})`,
      `audience_fit=${c.audienceFit.toFixed(2)}`,
      `30d_gmv=$${c.gmv30d.toLocaleString("en-US")}`,
      `avg_views=${c.avgVideoViews.toLocaleString("en-US")}`,
      `sample_acceptance=${Math.round(c.sampleAcceptanceRate * 100)}%`,
      `risk=${c.risk}`,
      `evidence=${c.evidence.join(" | ")}`,
    ].join("; "),
  ).join("\n");

  return [
    "Track: AI-Native Growth Tools. Sponsors: Nia + Reacher.",
    `Campaign task type: ${taskType}`,
    `Brand brief: ${prompt}`,
    "",
    "Reacher TikTok Shop demo evidence:",
    creatorRows,
    "",
    "Nia-backed context layer:",
    ...NIA_CONTEXT,
    "",
    "Required campaign output: ranked creator shortlist, Reacher evidence for each creator, audience-fit rationale, outreach drafts, sample-request notes, risk evaluation, and expected campaign-quality reasoning.",
  ].join("\n");
}
