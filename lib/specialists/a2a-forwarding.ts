import {
  configuredConnectionAvailability,
  executeA2AConnectedSpecialist,
  probeSpecialistConnection,
  toolAvailabilityFromProbe,
} from "./connection-runtime";
import { roleForSpecialist } from "../agent-roles";
import type {
  BidPayload,
  SpecialistConfig,
  SpecialistDecision,
  SpecialistOutput,
  SpecialistRunner,
} from "../types";

export function makeA2AForwardingSpecialist(config: SpecialistConfig): SpecialistRunner {
  return {
    config,
    async bid(prompt: string, taskType: string): Promise<SpecialistDecision> {
      if (!config.a2a_agent_card_url && !config.a2a_endpoint) {
        return {
          decline: true,
          reason:
            "No real A2A endpoint is configured for this specialist, so Arbor will not use a placeholder persona.",
        };
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

      const bid: BidPayload = {
        bid_price: config.cost_baseline,
        capability_claim: `${config.one_liner} Execution will be sent through ${probe.native ? "native A2A" : "Arbor's A2A bridge"}.`,
        estimated_seconds: Math.max(30, Math.round(config.cost_baseline * 180)),
        agent_role: roleForSpecialist(config),
        execution_preview:
          `Connected A2A run: message/send -> ${config.a2a_endpoint}; result must come back as A2A task status/artifacts.`,
        tool_availability: toolAvailabilityFromProbe(probe),
      };
      return bid;
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
