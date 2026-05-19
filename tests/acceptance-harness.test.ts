import assert from "node:assert/strict";
import test from "node:test";
import { runHarnessForAgent } from "../lib/acceptance-harness";
import type {
  CampaignLaunchArtifact,
  ImplementationPlanArtifact,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../lib/types";

function fakeConfig(agent_id: string, overrides: Partial<SpecialistConfig> = {}): SpecialistConfig {
  return {
    agent_id,
    display_name: agent_id,
    sponsor: "Test",
    capabilities: [],
    system_prompt: "",
    cost_baseline: 0.4,
    starting_reputation: 0.5,
    one_liner: "test",
    ...overrides,
  };
}

function fakeRunner(agent_id: string, fns: {
  bid?: (prompt: string, taskType: string) => Promise<SpecialistDecision>;
  execute?: (prompt: string, taskType: string) => Promise<SpecialistOutput>;
  configOverrides?: Partial<SpecialistConfig>;
}): SpecialistRunner {
  return {
    config: fakeConfig(agent_id, fns.configOverrides),
    async bid(prompt, taskType) {
      if (fns.bid) return fns.bid(prompt, taskType);
      return { decline: true, reason: "default decline" };
    },
    async execute(prompt, taskType) {
      if (fns.execute) return fns.execute(prompt, taskType);
      throw new Error("execute not stubbed");
    },
  };
}

const fullCampaign: CampaignLaunchArtifact = {
  kind: "campaign_launch",
  title: "Demo Launch Kit",
  summary: "Picked from live data.",
  evidence: {
    tools_used: ["list_shops_shops_get"],
    shops_queried: ["demo"],
    performance_window: "30d",
    currency: "USD",
  },
  creators: [
    {
      rank: 1,
      handle: "@one",
      gmv: 1,
      units_sold: 1,
      orders: 1,
      followers: 1,
      estimated_commission: 1,
      fit_reason: "fit",
    },
  ],
  outreach_drafts: [{ handle: "@one", message: "hi" }],
  sample_plan: [{ task: "ship", owner: "founder", status: "todo" }],
  risk_flags: ["no medical claims"],
  launch_plan: Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    action: `day ${i + 1}`,
    metric: "metric",
  })),
};

const fullImplementationPlan: ImplementationPlanArtifact = {
  kind: "implementation_plan",
  title: "Plan",
  summary: "Add endpoint and update docs.",
  agent_id: "fake-codex",
  mode: "plan_for_approval",
  user_goal: "Add healthz",
  context_required: [
    { owner: "nia", item: "route conventions", why: "preserve style" },
  ],
  proposed_build: [
    {
      step: 1,
      title: "Add route",
      deliverable: "GET /healthz returns 200",
      files_or_surfaces: ["app/healthz/route.ts"],
    },
    {
      step: 2,
      title: "Update docs",
      deliverable: "README curl example",
      files_or_surfaces: ["README.md"],
    },
  ],
  acceptance_criteria: ["Returns 200", "README updated"],
  user_questions: ["Process or container uptime?"],
  payment_checkpoint: {
    required_before_execution: true,
    reason: "Repo change",
  },
};

async function withEnv<T>(env: Record<string, string>, body: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    previous[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return await body();
  } finally {
    for (const k of Object.keys(env)) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
}

test("harness marks an agent ready when in-domain bid+execute pass rubric and out-of-domain declines", async () => {
  const runner = fakeRunner("reacher-social", {
    bid: async (_, taskType) => {
      if (taskType === "creator-campaign") {
        return {
          bid_price: 0.5,
          capability_claim: "live Reacher",
          estimated_seconds: 30,
        };
      }
      return { decline: true, reason: "Outside Reacher's TikTok Shop scope." };
    },
    execute: async () => fullCampaign,
  });

  await withEnv({ REACHER_API_KEY: "rk_test" }, async () => {
    const record = await runHarnessForAgent("reacher-social", {
      getRunner: () => runner,
      getConfig: () => runner.config,
    });

    assert.equal(record.readiness, "ready");
    assert.equal(record.in_domain.state, "accepted");
    assert.equal(record.out_of_domain.state, "declined_correctly");
  });
});

test("harness marks needs_fix when in-domain produces a judge-rejected artifact", async () => {
  const partial: CampaignLaunchArtifact = {
    ...fullCampaign,
    launch_plan: fullCampaign.launch_plan.slice(0, 2),
  };
  const runner = fakeRunner("reacher-social", {
    bid: async (_, taskType) =>
      taskType === "creator-campaign"
        ? { bid_price: 0.5, capability_claim: "live", estimated_seconds: 30 }
        : { decline: true, reason: "Outside scope." },
    execute: async () => partial,
  });

  await withEnv({ REACHER_API_KEY: "rk_test" }, async () => {
    const record = await runHarnessForAgent("reacher-social", {
      getRunner: () => runner,
      getConfig: () => runner.config,
    });

    assert.equal(record.readiness, "needs_fix");
    assert.equal(record.in_domain.state, "rejecting");
  });
});

test("harness marks needs_fix when out-of-domain bid is accepted", async () => {
  const runner = fakeRunner("reacher-social", {
    bid: async () => ({
      bid_price: 0.5,
      capability_claim: "I do everything",
      estimated_seconds: 30,
    }),
    execute: async () => fullCampaign,
  });

  await withEnv({ REACHER_API_KEY: "rk_test" }, async () => {
    const record = await runHarnessForAgent("reacher-social", {
      getRunner: () => runner,
      getConfig: () => runner.config,
    });

    assert.equal(record.readiness, "needs_fix");
    assert.equal(record.out_of_domain.state, "over_bid");
  });
});

test("harness buckets a credential decline as blocked_credential", async () => {
  const previous = process.env.NIA_API_KEY;
  delete process.env.NIA_API_KEY;
  try {
    const runner = fakeRunner("nia-context", {
      bid: async () => ({
        decline: true,
        reason: "NIA_API_KEY is not set",
      }),
    });

    const record = await runHarnessForAgent("nia-context", {
      getRunner: () => runner,
      getConfig: () => runner.config,
    });

    assert.equal(record.readiness, "blocked");
    assert.equal(record.in_domain.state, "blocked_credential");
  } finally {
    if (previous !== undefined) process.env.NIA_API_KEY = previous;
  }
});

test("harness buckets an endpoint-gated A2A agent as blocked_endpoint", async () => {
  const runner = fakeRunner("tensorlake-exec", {
    bid: async () => ({
      decline: true,
      reason: "No real A2A endpoint is configured for this specialist.",
    }),
    configOverrides: { protocol: "a2a" },
  });

  const record = await runHarnessForAgent("tensorlake-exec", {
    getRunner: () => runner,
    getConfig: () => runner.config,
  });

  assert.equal(record.readiness, "blocked");
  assert.equal(record.in_domain.state, "blocked_endpoint");
});

test("harness records an error result when execute throws", async () => {
  const runner = fakeRunner("codex-writer", {
    bid: async () => ({
      bid_price: 0.5,
      capability_claim: "yes",
      estimated_seconds: 30,
    }),
    execute: async () => {
      throw new Error("network exploded");
    },
  });

  await withEnv(
    { GITHUB_TOKEN: "gh_test", OPENAI_API_KEY: "sk-test", CODEX_DEFAULT_TARGET_REPO: "acme/scratch" },
    async () => {
    const record = await runHarnessForAgent("codex-writer", {
      getRunner: () => runner,
      getConfig: () => runner.config,
    });
    assert.equal(record.readiness, "needs_fix");
    assert.equal(record.in_domain.state, "error");
    assert.match(record.in_domain.reason ?? "", /network exploded/);
  });
});

test("harness accepts an implementation plan artifact via rubric", async () => {
  const runner = fakeRunner("codex-writer", {
    bid: async (_, taskType) =>
      taskType === "implementation"
        ? { bid_price: 0.5, capability_claim: "codex", estimated_seconds: 30 }
        : { decline: true, reason: "codex-writer only bids on software/repo implementation tasks." },
    execute: async () => fullImplementationPlan,
  });

  await withEnv(
    { GITHUB_TOKEN: "gh_test", OPENAI_API_KEY: "sk-test", CODEX_DEFAULT_TARGET_REPO: "acme/scratch" },
    async () => {
    const record = await runHarnessForAgent("codex-writer", {
      getRunner: () => runner,
      getConfig: () => runner.config,
    });
    assert.equal(record.readiness, "ready");
  });
});

test("harness returns untested when no fixture exists", async () => {
  const runner = fakeRunner("ghost-agent", {});
  const record = await runHarnessForAgent("ghost-agent", {
    getRunner: () => runner,
    getConfig: () => runner.config,
  });
  assert.equal(record.readiness, "untested");
  assert.equal(record.in_domain.state, "untested");
});
