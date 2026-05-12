import { makeMockSpecialist } from "./base";
import {
  configuredConnectionAvailability,
  executeA2AConnectedSpecialist,
  probeSpecialistConnection,
  toolAvailabilityFromProbe,
} from "./connection-runtime";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

export function makeA2AForwardingSpecialist(config: SpecialistConfig): SpecialistRunner {
  const fallback = makeMockSpecialist(config);

  return {
    config,
    async bid(prompt: string, taskType: string): Promise<SpecialistDecision> {
      if (!config.a2a_agent_card_url && !config.a2a_endpoint) {
        return await fallback.bid(prompt, taskType);
      }
      const configured = configuredConnectionAvailability(config);
      if (configured.status === "missing") {
        return {
          decline: true,
          reason: configured.reason ?? "A2A credentials are missing",
        };
      }
      const probe = await probeSpecialistConnection(config);
      if (probe.status !== "available") {
        return {
          decline: true,
          reason: `A2A connection unavailable: ${probe.reason}`,
        };
      }

      const fit = await fallback.bid(prompt, taskType);
      if ("decline" in fit) return fit;
      return {
        ...fit,
        capability_claim: `${fit.capability_claim} Execution will be sent through ${probe.native ? "native A2A" : "Arbor's A2A bridge"}.`,
        execution_preview:
          `Connected A2A run: tasks/send -> ${config.a2a_endpoint}; result must come back as A2A task status/artifacts.`,
        tool_availability: toolAvailabilityFromProbe(probe),
      };
    },
    async execute(prompt: string, taskType: string): Promise<SpecialistOutput> {
      const result = await executeA2AConnectedSpecialist({
        config,
        prompt,
        taskType,
      });
      return [
        "# A2A execution result",
        "",
        `Agent: ${config.display_name}`,
        `Connection: ${result.probe.native ? "native A2A" : "Arbor-hosted A2A bridge"}`,
        `Endpoint: ${result.probe.endpointUrl ?? config.a2a_endpoint}`,
        "",
        result.text,
      ].join("\n");
    },
  };
}
