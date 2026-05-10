/**
 * Synthesized fallbacks for the conversion-drop investigation flow. Used
 * when Hyperspell/Nia diagnosis is unavailable or the model-generated patch
 * fails validation, so the flow always lands a real PR even on a flaky
 * network.
 *
 * The demo target is the Stackform pricing page — a stub SaaS where the
 * conversion-drop framing is plausible (existing pricing copy + analytics
 * tracking already wired up).
 */

export const DEMO_REPO_URL =
  "https://github.com/bestceostevejobs-prog/Stackform";

/**
 * The conversion-drop analysis doc. In the demo narrative this lives in the
 * user's Google Drive — surfaced through Hyperspell (which has Drive as one
 * of its connected source types). On the first conversion-drop task we seed
 * this content into Hyperspell tagged `source_kind: "google_drive"` so
 * subsequent searches find it through the normal `searchMemories` path.
 */
export const ANALYSIS_DOC_FILENAME = "conversion-drop-analysis.md";
export const ANALYSIS_DOC_RESOURCE_ID = "drive:conversion-drop-analysis-md";
export const ANALYSIS_DOC_DRIVE_PATH =
  "My Drive/Stackform/Growth/conversion-drop-analysis.md";

export const CONVERSION_DROP_ANALYSIS_DOC = [
  "# Conversion drop — Tuesday 2026-05-05",
  "",
  "**Author:** growth-lead@stackform.com  ·  **Status:** Ready to fix",
  "",
  "## TL;DR",
  "",
  "The drop is a positioning bug compounded by a mobile CTA clip. The pricing page is written for solo developers, but the actual Pro buyer is a team lead — and the Tuesday spike came from a TikTok post that drove mobile-heavy traffic, which couldn't tap the upgrade button because it's clipped behind the iOS Safari toolbar.",
  "",
  "## What changed",
  "",
  "- 2026-05-05 (Tue): mobile traffic to `/pricing` spiked +340% from a TikTok post by @devops_dan referencing Stackform.",
  "- Conversion rate on `/pricing` dropped from 4.2% (14d baseline) → 1.1% on Tuesday.",
  "- Drop concentrated entirely on iOS Safari sessions; desktop conversion held steady.",
  "",
  "## Findings",
  "",
  "### 1. Strategic — wrong buyer framing",
  "",
  "The page targets a solo developer:",
  "",
  "- `<h1>Pick a plan.</h1>` — a navigation label, not a value pitch.",
  "- Pro card features lead with `Unlimited runs` / `Unlimited workflows` — runtime concerns.",
  "- Pro description: `For teams running agents in production.` — vague; doesn't say what the team gets.",
  "",
  "The actual Pro differentiators (audit logs, team sharing, 90-day log retention) are what a team lead cares about. `experiment-log.md exp_003` (referenced in the TODO at the top of `app/pricing/page.tsx`) is a copy test for exactly this audience.",
  "",
  "### 2. Technical — mobile CTA clip on iOS Safari",
  "",
  "In `PlanCard`, the CTA wrapper is `<div className=\"mt-10\">{cta}</div>`. There's no bottom padding, so on iOS Safari the bottom toolbar overlays the upgrade button and visitors can't tap it. The Tuesday traffic was 78% mobile (vs. ~30% baseline), which is why the drop is so sharp on this date.",
  "",
  "### 3. Observability — no experiment attribution",
  "",
  "`trackPricingPageView({ source: \"direct\" })` doesn't include the experiment variant, so the lift from exp_003 can't be attributed cleanly.",
  "",
  "## Recommended fix",
  "",
  "Scope: `app/pricing/page.tsx` only. Don't touch `components/UpgradeButton.tsx` or `convex/analytics.ts`. Use the existing `PRO_PRICE_ID` from `lib/stripe/config.ts`.",
  "",
  "1. Reframe the headline to `See what your team's agents are doing.` and rewrite the subhead around audit logs / team sharing / 90-day retention.",
  "2. Reorder the Pro features array so `Audit logs` and `Team sharing` lead.",
  "3. Reframe the Pro description to `For teams that need visibility into what their agents are doing.`",
  "4. Add `pb-20` to the CTA wrapper to clear the iOS Safari bottom toolbar.",
  "5. Tag `trackPricingPageView` with `experiment_variant: \"exp_003\"`.",
  "6. Drop the resolved TODO.",
  "",
  "Estimated effort: ~15 minutes. Low risk; checkout flow and `UpgradeButton` are untouched.",
  "",
  "## Sources",
  "",
  "- `app/pricing/page.tsx` (current state)",
  "- `experiment-log.md` exp_003",
  "- TikTok analytics for 2026-05-05 (mobile traffic spike)",
  "- Mixpanel funnel breakdown by device class",
].join("\n");

/** Backwards-compatible alias used by the existing fallback paths. */
export const FALLBACK_DIAGNOSIS = CONVERSION_DROP_ANALYSIS_DOC;

export const FALLBACK_PATCH_TARGET = "app/pricing/page.tsx";

export interface PatchOperation {
  /** Stable identifier shown in the PR description and lifecycle event. */
  label: string;
  /** Short human-readable summary of the change. */
  description: string;
  /** Substring that must be present in the source file. */
  match: string;
  /** What `match` is replaced with. */
  replace: string;
  /**
   * If true, a missing match for this op causes the whole rule-based path to
   * be marked unavailable so we fall through to docs-only. Use for the
   * load-bearing strategic edits — without them, the PR isn't worth landing.
   */
  required?: boolean;
}

/**
 * Rule-based patch operations for `app/pricing/page.tsx`.
 *
 * What an analyst would discover by reading the page (and the surrounding
 * stripe/analytics modules) and shipping a fix:
 *
 *   1. Strategic — the headline + Pro card describe the buyer as a solo
 *      developer ("Pick a plan", "Unlimited runs" first), but the actual
 *      Pro differentiators are team-oriented (audit logs, team sharing,
 *      90-day retention). Reframe both around team value.
 *   2. Technical — the CTA wrapper has no bottom padding for the iOS Safari
 *      bottom-toolbar safe area, so the upgrade button gets clipped on
 *      mobile. Add `pb-20`.
 *   3. Observability — the page-view event isn't tagged with the experiment
 *      variant, so the lift can't be attributed. Reuse the existing
 *      `trackPricingPageView` mutation; add `experiment_variant`.
 *   4. Cleanup — drop the resolved TODO comment.
 *
 * Operations are independent, applied in order. Required ones must match for
 * the rule-based path to be considered viable.
 */
export const FALLBACK_PATCH_OPERATIONS: PatchOperation[] = [
  {
    label: "headline-reframe",
    description:
      "Reframe the headline from a navigation label to a team-value pitch.",
    required: true,
    match: `          <h1 className="mt-3 text-3xl font-medium text-zinc-50">
            Pick a plan.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">
            Start free. Upgrade when your team needs more runs, longer
            retention, or shared workflows.
          </p>`,
    replace: `          <h1 className="mt-3 text-3xl font-medium text-zinc-50">
            See what your team's agents are doing.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">
            Audit logs, shared workflows, and 90-day retention so every run
            is reviewable and nothing happens off the record.
          </p>`,
  },
  {
    label: "pro-features-reorder",
    description:
      "Lead the Pro feature list with the team-oriented value (audit logs, team sharing).",
    required: true,
    match: `            features={[
              "Unlimited runs",
              "Unlimited workflows",
              "90-day log retention",
              "Team sharing",
              "Audit logs",
            ]}`,
    replace: `            features={[
              "Audit logs",
              "Team sharing",
              "90-day log retention",
              "Unlimited workflows",
              "Unlimited runs",
            ]}`,
  },
  {
    label: "pro-description-rewrite",
    description:
      "Reframe the Pro card description around team visibility instead of solo-dev runtime.",
    match: `            description="For teams running agents in production."`,
    replace: `            description="For teams that need visibility into what their agents are doing."`,
  },
  {
    label: "cta-safe-area",
    description:
      "Add bottom padding to the CTA wrapper for the Safari iOS bottom-toolbar safe area.",
    match: `      <div className="mt-10">{cta}</div>`,
    replace: `      <div className="mt-10 pb-20">{cta}</div>`,
  },
  {
    label: "analytics-experiment-tag",
    description:
      "Tag the page-view event with the experiment variant so the lift can be attributed.",
    match: `    trackPricingPageView({ source: "direct" });`,
    replace: `    trackPricingPageView({ source: "direct", experiment_variant: "exp_003" });`,
  },
  {
    label: "todo-cleanup",
    description: "Remove the resolved TODO comment.",
    match: `// TODO: update copy for team leads (see experiment-log.md exp_003)
export default function PricingPage() {`,
    replace: `export default function PricingPage() {`,
  },
];

export interface PatchApplication {
  patched: string;
  applied: string[];
  missing: string[];
  changed: boolean;
  /** True when every `required` operation found its match. */
  viable: boolean;
}

export function applyPatchOperations(
  source: string,
  operations: PatchOperation[],
): PatchApplication {
  let current = source;
  const applied: string[] = [];
  const missing: string[] = [];
  let viable = true;
  for (const op of operations) {
    if (current.includes(op.match)) {
      current = current.replace(op.match, op.replace);
      applied.push(op.label);
    } else {
      missing.push(op.label);
      if (op.required) viable = false;
    }
  }
  return {
    patched: current,
    applied,
    missing,
    changed: current !== source,
    viable,
  };
}

export const FALLBACK_DOCS_PATH = "docs/CONVERSION_FIX_NOTES.md";

export function fallbackDocsBody(diagnosis: string): string {
  return [
    "# Conversion fix — proposed change",
    "",
    "Generated by Arbor's auto-diagnosis flow.",
    "",
    "## Diagnosis",
    "",
    diagnosis,
    "",
    "## Proposed change to `app/pricing/page.tsx`",
    "",
    "- Replace headline `Pick a plan.` with `See what your team's agents are doing.` and rewrite the subhead around audit logs / shared workflows / 90-day retention.",
    "- Reorder Pro features so audit logs and team sharing lead the list.",
    "- Reframe the Pro card description from `For teams running agents in production.` to `For teams that need visibility into what their agents are doing.`",
    "- Add `pb-20` to the CTA wrapper inside `PlanCard` so the upgrade button isn't clipped on iOS Safari.",
    "- Tag the `trackPricingPageView` call with `experiment_variant: \"exp_003\"` so the lift is attributable.",
    "- Drop the resolved TODO comment.",
  ].join("\n");
}

export function isConversionDropPrompt(prompt: string | undefined | null): boolean {
  // DEMO OVERRIDE: every posted task currently routes through the hardcoded
  // conversion-drop investigation flow. Restore the substring check below
  // (and delete the `return true`) to switch back to the real auction flow.
  if (!prompt) return false;
  return true;
  // return prompt.toLowerCase().includes("conversion drop");
}
