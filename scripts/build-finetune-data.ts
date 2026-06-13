import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { RANK_SYSTEM_PROMPT } from "../lib/specialists/suggest";
import { MCP_CATALOG, type CatalogEntry } from "../lib/specialists/catalog";
import { ROUTER_TASKS, type RouterTask } from "../eval/router-bench/tasks";
import { HARD_TASKS } from "../eval/router-bench/tasks-hard";
import { EXTRA_SPECIALISTS } from "../eval/router-bench/distractors";

const OUT_DIR = process.argv[2] ?? "data/fine-tuning";
const HARD_POOL: CatalogEntry[] = [...MCP_CATALOG, ...EXTRA_SPECIALISTS];

interface FineTuneMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface FineTuneExample {
  messages: FineTuneMessage[];
}

function describeCatalogEntry(entry: CatalogEntry): string {
  return [
    `agent_id: ${entry.agent_id}`,
    `sponsor: ${entry.sponsor}`,
    `real_mcp: yes (${entry.mcp_endpoint})`,
    `capabilities: ${entry.capabilities.join(", ")}`,
    `one_liner: ${entry.one_liner}`,
    `tags: ${entry.domain_tags.join(", ")}`,
  ].join("\n");
}

function buildSuggesterUserPrompt(task: RouterTask, pool: CatalogEntry[]): string {
  return [
    `User goal:\n${task.goal}`,
    "Available specialists:",
    pool.map(describeCatalogEntry).join("\n---\n"),
  ].join("\n\n");
}

function overlapScore(task: RouterTask, entry: CatalogEntry): number {
  const goal = task.goal.toLowerCase();
  const fields = [
    entry.sponsor,
    entry.one_liner,
    ...entry.capabilities,
    ...entry.domain_tags,
  ].map((s) => s.toLowerCase());
  let score = 0.08;
  if (fields.some((field) => field.includes(task.gold_capability))) {
    score = Math.max(score, 0.72);
  }
  if (fields.some((field) => field.includes(task.domain))) {
    score = Math.max(score, 0.42);
  }
  const tokenHits = goal
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3)
    .filter((token) => fields.some((field) => field.includes(token))).length;
  score = Math.max(score, Math.min(0.68, 0.18 + tokenHits * 0.06));
  return Number(score.toFixed(2));
}

function buildSuggesterAssistant(task: RouterTask, pool: CatalogEntry[]): string {
  const gold = new Set(task.gold_specialist_ids);
  const ranked = pool
    .map((entry, index) => {
      const isGold = gold.has(entry.agent_id);
      const fit = isGold ? 0.96 : overlapScore(task, entry);
      return {
        agent_id: entry.agent_id,
        fit_score: fit,
        fit_reasoning: isGold
          ? `Directly satisfies ${task.gold_capability} for this ${task.domain} goal.`
          : fit >= 0.5
            ? `Some ${task.domain} overlap, but misses the required ${task.gold_capability} constraint.`
            : `Not a direct capability match for this ${task.domain} goal.`,
        index,
      };
    })
    .sort((a, b) => b.fit_score - a.fit_score || a.index - b.index)
    .map(({ index: _index, ...item }) => item);

  return JSON.stringify({ ranked });
}

function buildSuggesterExamples(): FineTuneExample[] {
  const easy = ROUTER_TASKS.map((task) => ({ task, pool: MCP_CATALOG }));
  const hard = HARD_TASKS.map((task) => ({ task, pool: HARD_POOL }));
  return [...easy, ...hard].map(({ task, pool }) => ({
    messages: [
      { role: "system", content: RANK_SYSTEM_PROMPT },
      { role: "user", content: buildSuggesterUserPrompt(task, pool) },
      { role: "assistant", content: buildSuggesterAssistant(task, pool) },
    ],
  }));
}

const JUDGE_SYSTEM_PROMPT = `You are an impartial judge for a general-purpose agent marketplace. The user described a goal in their own words; a specialist agent produced a deliverable. Decide whether the deliverable actually addresses the user's goal in a useful, specific, well-reasoned way. Output JSON only:
{ "verdict": "accept" | "reject", "reasoning": "<one paragraph>", "quality_score": <0.0-1.0> }

Strict rules for your reasoning paragraph:
- Describe ONLY content that is literally present in the agent's output. Do not invent topics, sections, or shortcomings.
- Quote or paraphrase specific phrases from the output to ground every claim you make.
- If the output is shorter than expected, say so plainly — don't fabricate missing content.

Reject when the deliverable is off-topic from the goal, vague hand-waving, ignores an explicit constraint the user stated, or is so incomplete it can't be used. Accept when the output materially advances the user's goal — perfection is not required.`;

function judgeUserPrompt(goal: string, output: string): string {
  return [`User goal:\n${goal}`, `Agent output:\n${output}`].join("\n\n---\n\n");
}

function judgeExample(goal: string, output: string, verdict: unknown): FineTuneExample {
  return {
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: judgeUserPrompt(goal, output) },
      { role: "assistant", content: JSON.stringify(verdict) },
    ],
  };
}

function buildJudgeExamples(): FineTuneExample[] {
  return [
    judgeExample(
      "Set up Stripe Connect for a marketplace with seller onboarding, split payouts, and refund handling.",
      "Implementation plan:\n1. Create Express connected accounts for each seller with account links.\n2. Use Checkout Sessions with payment_intent_data.application_fee_amount and transfer_data.destination for split payouts.\n3. Store the connected account ID on the seller profile.\n4. Add webhooks for account.updated, checkout.session.completed, payment_intent.succeeded, charge.refunded.\n5. Process refunds through the original PaymentIntent and reconcile platform fees.",
      {
        verdict: "accept",
        reasoning:
          "The output directly addresses the requested Stripe Connect setup by naming Express connected accounts, account links, split-payout fields like application_fee_amount and transfer_data.destination, webhook events, and refund handling.",
        quality_score: 0.92,
      },
    ),
    judgeExample(
      "Set up Stripe Connect for a marketplace with seller onboarding, split payouts, and refund handling.",
      "Here is a TikTok creator campaign plan with five creators, outreach copy, sample requests, and a seven-day posting calendar.",
      {
        verdict: "reject",
        reasoning:
          "The output is off-topic: it provides a TikTok creator campaign plan and does not mention Stripe Connect, seller onboarding, split payouts, or refunds.",
        quality_score: 0.04,
      },
    ),
    judgeExample(
      "Pick the best specialist for a merchant-of-record SaaS checkout where the provider handles global VAT.",
      "Use Lemon Squeezy because the deliverable needs merchant-of-record SaaS billing, global sales tax, VAT handling, and license/subscription operations. Stripe can process payments, but it is not the merchant of record for this requirement.",
      {
        verdict: "accept",
        reasoning:
          "The output chooses Lemon Squeezy and grounds the choice in the literal requirement for merchant-of-record SaaS billing, global sales tax, and VAT handling.",
        quality_score: 0.88,
      },
    ),
    judgeExample(
      "Pick the best specialist for a merchant-of-record SaaS checkout where the provider handles global VAT.",
      "Stripe is the most famous payment provider, so choose Stripe. It can probably do all checkout work.",
      {
        verdict: "reject",
        reasoning:
          "The output relies on Stripe being famous and says it can 'probably' do checkout work, but it does not address the merchant-of-record or global VAT constraint.",
        quality_score: 0.18,
      },
    ),
    judgeExample(
      "Create a launch plan for a clean-label electrolyte drink on TikTok Shop using creator evidence, outreach drafts, risk flags, and a 7-day plan.",
      "Creator shortlist: MayaFit, TrailDad, and HydrateLab, each with niche, average views, sample acceptance, and GMV notes. Outreach drafts are customized per creator. Risk flags include caffeine claims, FTC disclosure copy, sample shipping timing, and low stock. The 7-day plan covers creator approval, sample requests, Spark Ads setup, first posts, and GMV review.",
      {
        verdict: "accept",
        reasoning:
          "The output materially advances the TikTok Shop launch goal by including a creator shortlist with evidence fields, customized outreach drafts, risk flags, and a seven-day execution plan.",
        quality_score: 0.9,
      },
    ),
    judgeExample(
      "Create a launch plan for a clean-label electrolyte drink on TikTok Shop using creator evidence, outreach drafts, risk flags, and a 7-day plan.",
      "You should do influencer marketing because TikTok is popular. Make a fun video and see what happens.",
      {
        verdict: "reject",
        reasoning:
          "The output is vague and incomplete: it only says to do influencer marketing and make a fun video, with no creator evidence, outreach drafts, risk flags, or seven-day plan.",
        quality_score: 0.08,
      },
    ),
    judgeExample(
      "Deploy my Next.js app and check the build logs for failures.",
      "Deployment checklist: connect the GitHub repo to Vercel, set NEXT_PUBLIC_CONVEX_URL and Clerk keys, trigger a production deployment, inspect the build log for TypeScript or env-var errors, and roll back if health checks fail.",
      {
        verdict: "accept",
        reasoning:
          "The output addresses the Next.js deployment goal with Vercel repo connection, environment variables, a production deployment, build-log inspection, and rollback guidance.",
        quality_score: 0.82,
      },
    ),
    judgeExample(
      "Deploy my Next.js app and check the build logs for failures.",
      "Use Figma to export your color tokens and make the design more polished.",
      {
        verdict: "reject",
        reasoning:
          "The output is about Figma color tokens and design polish, not deploying a Next.js app or checking build logs.",
        quality_score: 0.03,
      },
    ),
    judgeExample(
      "Configure Arbor to use Azure OpenAI for the GPT-5 agent, keep judge and suggester deployments separate, and fail closed if Azure env is incomplete.",
      "Runtime changes: set ARBOR_MODEL_PROVIDER=azure-openai, ARBOR_REQUIRE_AZURE=true, AZURE_OPENAI_API_MODE=responses, AZURE_OPENAI_AGENT_DEPLOYMENT=gpt5-agent, AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge, and AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester. The runtime refuses direct OpenAI fallback when Azure is required and stops all remote calls when ARBOR_MODEL_SPEND_DISABLED=true.",
      {
        verdict: "accept",
        reasoning:
          "The output directly configures Azure OpenAI for Arbor by naming azure-openai, the GPT-5 agent deployment, separate judge and suggester deployments, and the fail-closed ARBOR_REQUIRE_AZURE and ARBOR_MODEL_SPEND_DISABLED controls.",
        quality_score: 0.94,
      },
    ),
    judgeExample(
      "Configure Arbor to use Azure OpenAI for the GPT-5 agent, keep judge and suggester deployments separate, and fail closed if Azure env is incomplete.",
      "Set OPENAI_API_KEY to your normal OpenAI key and keep using the existing model name. If Azure fails, the app can just fall back to OpenAI automatically.",
      {
        verdict: "reject",
        reasoning:
          "The output keeps using a normal OpenAI key and explicitly recommends automatic fallback to OpenAI, which contradicts the Azure OpenAI and fail-closed requirements.",
        quality_score: 0.02,
      },
    ),
    judgeExample(
      "Create a safe instant-off plan for Arbor's Azure setup, including local, Convex, Vercel, app hosting, and a hard stop for Azure standing charges.",
      "Off plan: patch .env.local with ARBOR_MODEL_PROVIDER=disabled and ARBOR_MODEL_SPEND_DISABLED=true, set the same keys in Convex, apply Vercel env vars with azure:vercel off, scale Container Apps to min=0 max=0, stop any App Service, and for a hard stop run a confirmed resource-group deletion of arbor-ai-rg.",
      {
        verdict: "accept",
        reasoning:
          "The output covers local, Convex, Vercel, Container Apps, App Service, and a confirmed resource-group deletion, which directly matches the requested instant-off and hard-stop scope.",
        quality_score: 0.96,
      },
    ),
    judgeExample(
      "Create a safe instant-off plan for Arbor's Azure setup, including local, Convex, Vercel, app hosting, and a hard stop for Azure standing charges.",
      "Just lower max_tokens on the model. This should reduce the bill enough.",
      {
        verdict: "reject",
        reasoning:
          "The output only lowers max_tokens and does not mention disabling local or Convex model calls, Vercel env, app hosting, or any hard stop for Azure standing charges.",
        quality_score: 0.08,
      },
    ),
    judgeExample(
      "Prepare Azure fine-tuning data for Arbor's agentic market judge and suggester with train, validation, and held-out test splits.",
      "Generated SFT JSONL files for arbor-judge and arbor-suggester, each with system/user/assistant messages. The assistant payloads are strict JSON. The judge files emit verdict, reasoning, and quality_score. The suggester files emit ranked specialist IDs with fit scores and reasoning. Validation and held-out test files are kept separate from training.",
      {
        verdict: "accept",
        reasoning:
          "The output names train, validation, and held-out test files, describes SFT chat messages, strict JSON assistant payloads, and the specific judge and suggester output schemas.",
        quality_score: 0.91,
      },
    ),
    judgeExample(
      "Prepare Azure fine-tuning data for Arbor's agentic market judge and suggester with train, validation, and held-out test splits.",
      "I wrote a few notes in a markdown file about what good specialist recommendations should look like.",
      {
        verdict: "reject",
        reasoning:
          "The output only mentions notes in a markdown file and does not provide Azure SFT JSONL, train/validation/test splits, or the judge and suggester output schemas.",
        quality_score: 0.06,
      },
    ),
    judgeExample(
      "Link Azure or Foundry models into coding tools through an OpenAI-compatible API configuration.",
      "Use OPENAI_BASE_URL=https://<resource>.openai.azure.com/openai/v1, OPENAI_API_KEY from the Azure OpenAI key, OPENAI_MODEL=gpt5-agent, and OPENAI_API_KEY_HEADER=api-key. Verify with a low-token chat/completions smoke request before using the coding tool.",
      {
        verdict: "accept",
        reasoning:
          "The output provides the OpenAI-compatible base URL, API key, model deployment, api-key header, and a smoke request to verify the coding-tool route.",
        quality_score: 0.89,
      },
    ),
    judgeExample(
      "Link Azure or Foundry models into coding tools through an OpenAI-compatible API configuration.",
      "Open the Azure Portal and copy whatever endpoint looks right into your editor settings.",
      {
        verdict: "reject",
        reasoning:
          "The output is vague because it says to copy whatever endpoint looks right and does not provide OPENAI_BASE_URL, OPENAI_MODEL, API key handling, or verification.",
        quality_score: 0.12,
      },
    ),
    judgeExample(
      "Choose the best MCP-backed specialist for a task that needs browser testing of a local Next.js app.",
      "Select the Browser specialist because the task requires opening a local Next.js URL, clicking through the app, and taking screenshots or DOM snapshots. Vercel can inspect hosted deployments, but the local-browser requirement points to Browser.",
      {
        verdict: "accept",
        reasoning:
          "The output selects Browser and grounds the choice in local Next.js navigation, clicking, screenshots, and DOM snapshots, while contrasting Vercel as hosted-deployment inspection.",
        quality_score: 0.87,
      },
    ),
    judgeExample(
      "Choose the best MCP-backed specialist for a task that needs browser testing of a local Next.js app.",
      "Use Gmail because it can search for messages about the app and maybe find a deployment link.",
      {
        verdict: "reject",
        reasoning:
          "The output chooses Gmail for searching messages, which does not address browser testing of a local Next.js app with navigation or screenshots.",
        quality_score: 0.05,
      },
    ),
    judgeExample(
      "Verify a deployed Arbor A2A worker uses Azure OpenAI and returns an agent-card-compatible response.",
      "Check the worker environment for ARBOR_MODEL_PROVIDER=azure-openai, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_AGENT_DEPLOYMENT=gpt5-agent, and WORKER_BEARER_TOKEN. Then call the worker health endpoint and an A2A message endpoint, confirming the response includes the expected agent identity and model route.",
      {
        verdict: "accept",
        reasoning:
          "The output verifies Azure OpenAI worker env, the GPT-5 agent deployment, bearer token, health endpoint, A2A message endpoint, agent identity, and model route.",
        quality_score: 0.84,
      },
    ),
    judgeExample(
      "Verify a deployed Arbor A2A worker uses Azure OpenAI and returns an agent-card-compatible response.",
      "If the worker container starts, assume it is fine. Container startup is enough proof.",
      {
        verdict: "reject",
        reasoning:
          "The output says container startup is enough and does not verify Azure OpenAI env, the GPT-5 deployment, health checks, A2A messaging, or the response shape.",
        quality_score: 0.1,
      },
    ),
    judgeExample(
      "Audit Azure readiness for Arbor before spending credits, including provider registration, model capacity, budget guardrail, and quota.",
      "Run the prereq check for Azure CLI login, Bicep support, and registered providers, then run the capacity check for the GPT-5 agent and judge/suggester base models. Confirm the Cost Management budget is at or below the $10,000 credit total before applying the Bicep deployment.",
      {
        verdict: "accept",
        reasoning:
          "The output covers Azure CLI login, Bicep, provider registration, model capacity for GPT-5 and judge/suggester bases, quota, and a budget at or below the $10,000 credit total.",
        quality_score: 0.93,
      },
    ),
    judgeExample(
      "Audit Azure readiness for Arbor before spending credits, including provider registration, model capacity, budget guardrail, and quota.",
      "Deploy first and check the bill later. The credits should cover it.",
      {
        verdict: "reject",
        reasoning:
          "The output recommends deploying first and checking the bill later, and it does not mention provider registration, capacity, quota, or a budget guardrail.",
        quality_score: 0.01,
      },
    ),
    judgeExample(
      "Review an Arbor marketplace delivery and decide whether the specialist earned payment from escrow.",
      "The deliverable cites three candidate specialists, explains why the winner is the best fit, includes execution steps, names risks, and provides a concrete handoff artifact. It should be accepted and escrow can be released.",
      {
        verdict: "accept",
        reasoning:
          "The output supports escrow release by citing three candidate specialists, winner-fit reasoning, execution steps, risks, and a concrete handoff artifact.",
        quality_score: 0.86,
      },
    ),
    judgeExample(
      "Review an Arbor marketplace delivery and decide whether the specialist earned payment from escrow.",
      "Looks good enough. Pay them.",
      {
        verdict: "reject",
        reasoning:
          "The output only says 'Looks good enough' and 'Pay them' without citing the specialist delivery, fit reasoning, risks, or a concrete artifact.",
        quality_score: 0.09,
      },
    ),
    judgeExample(
      "Diagnose why Arbor should not submit a real external account creation form during browser testing without confirmation.",
      "Creating an account in Clerk, AuthKit, Stripe, or another provider is a persistent external side effect. The test should stop before final submit and ask for confirmation unless the exact test data and destination were pre-approved.",
      {
        verdict: "accept",
        reasoning:
          "The output identifies provider account creation as a persistent external side effect and says to stop before final submit unless exact test data and destination were pre-approved.",
        quality_score: 0.9,
      },
    ),
    judgeExample(
      "Diagnose why Arbor should not submit a real external account creation form during browser testing without confirmation.",
      "It is fine to create accounts during tests because test users can be deleted later.",
      {
        verdict: "reject",
        reasoning:
          "The output says it is fine to create accounts during tests and does not require confirmation before the persistent external side effect.",
        quality_score: 0.04,
      },
    ),
  ];
}

function splitExamples(examples: FineTuneExample[]): {
  train: FineTuneExample[];
  validation: FineTuneExample[];
  test: FineTuneExample[];
} {
  const validation: FineTuneExample[] = [];
  const test: FineTuneExample[] = [];
  const train: FineTuneExample[] = [];
  examples.forEach((example, index) => {
    if (index % 6 === 5) test.push(example);
    else if (index % 6 === 4) validation.push(example);
    else train.push(example);
  });
  return { train, validation, test };
}

async function writeJsonl(path: string, examples: FineTuneExample[]): Promise<void> {
  const jsonl = examples.map((example) => JSON.stringify(example)).join("\n") + "\n";
  await writeFile(path, "\ufeff" + jsonl, "utf8");
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const suggester = splitExamples(buildSuggesterExamples());
  const judge = splitExamples(buildJudgeExamples());

  await writeJsonl(join(OUT_DIR, "arbor-suggester.train.jsonl"), suggester.train);
  await writeJsonl(
    join(OUT_DIR, "arbor-suggester.validation.jsonl"),
    suggester.validation,
  );
  await writeJsonl(join(OUT_DIR, "arbor-suggester.test.jsonl"), suggester.test);
  await writeJsonl(join(OUT_DIR, "arbor-judge.train.jsonl"), judge.train);
  await writeJsonl(join(OUT_DIR, "arbor-judge.validation.jsonl"), judge.validation);
  await writeJsonl(join(OUT_DIR, "arbor-judge.test.jsonl"), judge.test);

  console.log(
    JSON.stringify(
      {
        output_dir: OUT_DIR,
        suggester_train: suggester.train.length,
        suggester_validation: suggester.validation.length,
        suggester_test: suggester.test.length,
        judge_train: judge.train.length,
        judge_validation: judge.validation.length,
        judge_test: judge.test.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
