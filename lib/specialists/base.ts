import { callOpenAI, callOpenAIJSON } from "../openai";
import type {
  SpecialistConfig,
  SpecialistDecision,
  SpecialistRunner,
  BidPayload,
  DeclineDecision,
} from "../types";

const VICKREY_PRELUDE = `You are participating in a Vickrey second-price sealed-bid auction. The price you actually pay if you win is set by the second-highest bidder, not your own bid. Your dominant strategy is therefore to bid your true cost. Bidding lower than your true cost risks winning at a loss. Bidding higher than true cost reduces your win probability without increasing your profit. Bid honestly.`;

interface BidLLMResponse {
  decline?: boolean;
  reason?: string;
  bid_price?: number;
  capability_claim?: string;
  estimated_seconds?: number;
}

/**
 * Default specialist runner: uses OpenAI to imitate the sponsor product behavior
 * (mock). Real sponsor integrations should replace this with a sponsor-specific
 * implementation in their own file.
 */
export function makeMockSpecialist(config: SpecialistConfig): SpecialistRunner {
  return {
    config,
    async bid(prompt, taskType): Promise<SpecialistDecision> {
      const systemPrompt = `${config.system_prompt}\n\n${VICKREY_PRELUDE}\n\nYour cost baseline for a typical task is $${config.cost_baseline.toFixed(
        2,
      )}. Adjust up or down by task complexity but keep it honest.\n\nRespond with JSON only, one of:\n{ "decline": true, "reason": "<short reason>" }\nOR\n{ "bid_price": <number>, "capability_claim": "<one sentence>", "estimated_seconds": <integer> }`;

      const userPrompt = `Task type: ${taskType}\n\nTask prompt:\n${prompt}\n\nDo you want to bid?`;
      const data = await callOpenAIJSON<BidLLMResponse>({
        systemPrompt,
        userPrompt,
        maxTokens: 256,
        timeoutMs: 10_000,
        retries: 0,
      });

      if (data.decline) {
        const decline: DeclineDecision = {
          decline: true,
          reason: data.reason ?? "Capability mismatch",
        };
        return decline;
      }

      if (
        typeof data.bid_price !== "number" ||
        typeof data.capability_claim !== "string" ||
        typeof data.estimated_seconds !== "number"
      ) {
        // Coerce minimum viable bid from the cost baseline if the model returned a malformed object.
        const bid: BidPayload = {
          bid_price: config.cost_baseline,
          capability_claim: config.one_liner,
          estimated_seconds: 30,
        };
        return bid;
      }

      const bid: BidPayload = {
        bid_price: Math.max(0.01, Number(data.bid_price.toFixed(2))),
        capability_claim: data.capability_claim,
        estimated_seconds: Math.max(1, Math.floor(data.estimated_seconds)),
      };
      return bid;
    },

    async execute(prompt, taskType): Promise<string> {
      const systemPrompt = `${config.system_prompt}\n\nYou have just won the auction for the following task. Produce your best, focused output. Use markdown. Include code in fenced blocks where appropriate. Stay in character as ${config.display_name}.`;
      const userPrompt = `Task type: ${taskType}\n\nTask prompt:\n${prompt}`;
      return await callOpenAI({
        systemPrompt,
        userPrompt,
        maxTokens: 1500,
        timeoutMs: 60_000,
        retries: 0,
      });
    },
  };
}
