export const ARBOR_LLM_PROVIDER = "openai" as const;
export type ArborLLMProvider = typeof ARBOR_LLM_PROVIDER;

export const DEFAULT_OPENAI_MODEL = "gpt-5.5";
export const LLM_PROVIDER_LABEL = "OpenAI";

export function configuredLLMProvider(): ArborLLMProvider {
  return ARBOR_LLM_PROVIDER;
}

export function defaultLLMModel(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export function llmProviderSummary(): string {
  return `${LLM_PROVIDER_LABEL} via lib/openai.ts`;
}
