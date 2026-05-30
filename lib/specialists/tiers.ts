import type { InternalSpecialistTier, SpecialistTier } from "../types";

/**
 * Maps an internal runner tier to the public-facing tier shown in the UI
 * and SpecialistProvenance. Extracted into its own module so that runner
 * files can import it without creating a circular dependency through registry.ts.
 */
export function toPublicTier(internal: InternalSpecialistTier): SpecialistTier {
  switch (internal) {
    case "a2a":            return "native-a2a";
    // Hand-built MCP integrations and auto-enrolled catalog MCPs are both
    // bridges in spirit: real sessions through MCP/REST that Arbor wraps in
    // an A2A-shaped flow. The actual liveness gate is the probe() method —
    // anything without a passing probe is filtered into the demo lane by
    // the auctioneer regardless of this label.
    case "a2a-bridge":     return "a2a-bridge";
    case "real":           return "a2a-bridge";
    case "mcp-forwarding": return "a2a-bridge";
    case "mock":           return "not-a2a-yet";
    case "disabled":       return "disabled";
  }
}
