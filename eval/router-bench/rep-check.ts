/**
 * M3 mechanism proof — reputation closes the loop.
 *
 *   npx tsx eval/router-bench/rep-check.ts
 *
 * Two specialists are made IDENTICAL in capability (a true tie on fit). With no
 * reputation they tie; once one has a strong REAL judged track record, routing
 * must rank it first. This proves the effectiveness signal — not just the
 * capability prompt — decides among comparable specialists.
 *
 * Runs offline and deterministically: with no OPENAI_API_KEY, suggestSpecialists
 * falls back to the keyword ranker, so the twins get equal base fit and the
 * reputation blend is the only tiebreaker. (We deliberately do NOT load
 * .env.local here.)
 *
 * Also asserts the safety bound: a high-reputation but WEAK-fit agent must not
 * leapfrog a clearly better-fit agent.
 */

import { suggestSpecialists, type ReputationMap } from "../../lib/specialists/suggest";
import type { SpecialistConfig } from "../../lib/types";

function spec(agent_id: string, capability: string, oneLiner: string): SpecialistConfig {
  return {
    agent_id,
    display_name: agent_id,
    sponsor: agent_id, // unique, absent from the goal text
    capabilities: [capability],
    system_prompt: "",
    cost_baseline: 0.4,
    starting_reputation: 1,
    one_liner: oneLiner,
    tier: "mock",
  };
}

let failures = 0;
function check(name: string, cond: boolean, detail: string): void {
  const tag = cond ? "✓ PASS" : "✗ FAIL";
  if (!cond) failures += 1;
  // eslint-disable-next-line no-console
  console.log(`${tag}  ${name} — ${detail}`);
}

async function main(): Promise<void> {
  // Unique capability so catalog distractors score ~0 and our twins top.
  const CAP = "flux-capacitor-calibration";
  const goal = `I need help with ${CAP} on my delorean time circuits`;
  const twinA = spec("twin-a", CAP, "Calibrates flux capacitors.");
  const twinB = spec("twin-b", CAP, "Calibrates flux capacitors.");

  // 1) No reputation → tie. Equal fit, equal adjusted score.
  const none = await suggestSpecialists(goal, undefined, [twinA, twinB], 5, {});
  const a0 = none.suggestions.find((s) => s.agent_id === "twin-a");
  const b0 = none.suggestions.find((s) => s.agent_id === "twin-b");
  check(
    "twins tie with no reputation",
    !!a0 && !!b0 && a0.adjusted_score === b0.adjusted_score,
    `a=${a0?.adjusted_score?.toFixed(3)} b=${b0?.adjusted_score?.toFixed(3)}`,
  );

  // 2) Reputation on twin-b → twin-b ranks first and is boosted.
  const repB: ReputationMap = { "twin-b": { overall: 0.95, tasks: 10 } };
  const withRep = await suggestSpecialists(goal, undefined, [twinA, twinB], 5, repB);
  const top = withRep.suggestions[0];
  const bAdj = withRep.suggestions.find((s) => s.agent_id === "twin-b")?.adjusted_score ?? 0;
  const bBase = withRep.suggestions.find((s) => s.agent_id === "twin-b")?.base_fit_score ?? 0;
  check(
    "reputation flips the winner to twin-b",
    top?.agent_id === "twin-b",
    `top=${top?.agent_id}`,
  );
  check(
    "twin-b score is boosted above its base fit",
    bAdj > bBase,
    `adjusted=${bAdj.toFixed(3)} > base=${bBase.toFixed(3)}`,
  );

  // 3) Safety bound: a strong-fit agent with NO reputation must beat a
  //    weak-fit agent that has perfect reputation. Weak fit = a capability that
  //    only partially appears in the goal; strong fit = exact capability.
  const strong = spec("strong-fit", CAP, "Calibrates flux capacitors precisely.");
  const weak = spec("weak-fit", "unrelated-widget-polishing", "Polishes widgets.");
  const repWeak: ReputationMap = { "weak-fit": { overall: 1.0, tasks: 50 } };
  const safety = await suggestSpecialists(goal, undefined, [strong, weak], 5, repWeak);
  check(
    "high-rep weak-fit does NOT leapfrog strong-fit",
    safety.suggestions[0]?.agent_id === "strong-fit",
    `top=${safety.suggestions[0]?.agent_id}`,
  );

  // eslint-disable-next-line no-console
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
