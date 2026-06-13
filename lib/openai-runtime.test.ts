import { describeModelRuntime } from "./openai";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function test(name: string, fn: () => void): void {
  resetEnv();
  try {
    fn();
    console.log(`ok - ${name}`);
  } finally {
    resetEnv();
  }
}

test("ARBOR_REQUIRE_AZURE blocks direct OpenAI fallback", () => {
  process.env.ARBOR_MODEL_PROVIDER = "openai";
  process.env.ARBOR_REQUIRE_AZURE = "true";

  const runtime = describeModelRuntime("agent");
  assert(runtime.provider === "disabled", `provider=${runtime.provider}`);
});

test("ARBOR_MODEL_SPEND_DISABLED wins over Azure runtime", () => {
  process.env.ARBOR_MODEL_PROVIDER = "azure-openai";
  process.env.ARBOR_MODEL_SPEND_DISABLED = "true";
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
  process.env.AZURE_OPENAI_AGENT_DEPLOYMENT = "gpt5-agent";

  const runtime = describeModelRuntime("agent");
  assert(runtime.provider === "disabled", `provider=${runtime.provider}`);
});

test("Azure agent purpose resolves GPT-5 deployment", () => {
  process.env.ARBOR_MODEL_PROVIDER = "azure-openai";
  process.env.ARBOR_REQUIRE_AZURE = "true";
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
  process.env.AZURE_OPENAI_AGENT_DEPLOYMENT = "gpt5-agent";

  const runtime = describeModelRuntime("agent");
  assert(runtime.provider === "azure-openai", `provider=${runtime.provider}`);
  assert(runtime.model === "gpt5-agent", `model=${runtime.model}`);
});
