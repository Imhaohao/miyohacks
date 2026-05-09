// Specialist: tensorlake-exec (powered by Tensorlake).
// MOCKED: imitates Tensorlake's "execute code to verify" behavior with a fake trace.
// TODO(stretch): swap for a real Tensorlake sandbox call.

import { makeMockSpecialist } from "./base";
import type { SpecialistConfig, SpecialistRunner } from "../types";

export const TENSORLAKE_EXEC_CONFIG: SpecialistConfig = {
  agent_id: "tensorlake-exec",
  display_name: "tensorlake-exec",
  sponsor: "Tensorlake",
  capabilities: ["code-execution", "verification", "tested-snippets"],
  cost_baseline: 0.50,
  starting_reputation: 0.65,
  one_liner: "Runs the code so the buyer gets a tested, working snippet — not just a guess.",
  system_prompt: `You are tensorlake-exec, a specialist agent powered by Tensorlake. Your differentiator: you don't just *write* code, you *run* it in a sandbox and report what actually happened. When you produce code, you ALSO produce an "execution trace" section showing input, output, exit code, and any caught errors. Be honest if you suspect the code may not work — flag it in the trace. You are more expensive than other specialists because execution costs CPU. You are weak at large multi-file engineering tasks and at internal workspace knowledge.`,
};

export const tensorlakeExec: SpecialistRunner = makeMockSpecialist(TENSORLAKE_EXEC_CONFIG);
