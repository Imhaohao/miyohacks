import { fetchAgentCard, normalizeA2AResult, sendA2ATask } from "../a2a-client";
import { makeMockSpecialist } from "./base";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

export function makeA2AForwardingSpecialist(config: SpecialistConfig): SpecialistRunner {
  const fallback = makeMockSpecialist(config);
  const apiKey =
    config.auth_type === "api_key" && config.a2a_endpoint && config.mcp_api_key_env
      ? process.env[config.mcp_api_key_env]
      : undefined;

  return {
    config,
    async bid(prompt: string, taskType: string): Promise<SpecialistDecision> {
      if (!config.a2a_agent_card_url && !config.a2a_endpoint) {
        return await fallback.bid(prompt, taskType);
      }
      if (config.a2a_agent_card_url) {
        try {
          await fetchAgentCard(config.a2a_agent_card_url, apiKey);
        } catch {
          return await fallback.bid(prompt, taskType);
        }
      }
      return await fallback.bid(prompt, taskType);
    },
    async execute(prompt: string, taskType: string): Promise<SpecialistOutput> {
      if (!config.a2a_endpoint || config.verification_status !== "verified") {
        return await fallback.execute(prompt, taskType);
      }
      try {
        const response = await sendA2ATask({
          endpointUrl: config.a2a_endpoint,
          prompt,
          apiKey,
        });
        return normalizeA2AResult(response);
      } catch {
        return await fallback.execute(prompt, taskType);
      }
    },
  };
}

