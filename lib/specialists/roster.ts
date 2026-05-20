import type { AgentRosterClass } from "../types";

export const CANONICAL_V0_PROTOCOL_AGENT_IDS = [
  "nia-context",
  "hyperspell-brain",
  "tensorlake-exec",
  "codex-writer",
  "devin-engineer",
] as const;

export const DEMO_EXTENSION_AGENT_IDS = [
  "reacher-social",
  "vercel-v0",
  "insforge-backend",
  "aside-browser",
  "convex-realtime",
] as const;

export const CONTACT_CATALOG_DISCOVERED_FOR = "100-agent contact catalog";

export const ROSTER_CLASS_ORDER: AgentRosterClass[] = [
  "canonical_v0",
  "demo_extension",
  "discovered_contact",
  "post_v0_integration",
];

export const ROSTER_CLASS_LABELS: Record<AgentRosterClass, string> = {
  canonical_v0: "Canonical v0",
  demo_extension: "Demo extension",
  discovered_contact: "Discovered contact",
  post_v0_integration: "Post-v0 integration",
};

export const ROSTER_CLASS_DESCRIPTIONS: Record<AgentRosterClass, string> = {
  canonical_v0:
    "The original five sponsor specialists in the v0 Agent Auction Protocol roster.",
  demo_extension:
    "Hackathon/product demo specialist layered on top of the protocol roster.",
  discovered_contact:
    "Contact catalog or runtime-discovered specialist, clearly outside the canonical v0 roster.",
  post_v0_integration:
    "Useful integration target for the marketplace, but not part of the v0 protocol roster.",
};

const CANONICAL_V0_IDS = new Set<string>(CANONICAL_V0_PROTOCOL_AGENT_IDS);
const DEMO_EXTENSION_IDS = new Set<string>(DEMO_EXTENSION_AGENT_IDS);

export interface RosterClassSubject {
  agent_id: string;
  discovered?: boolean;
  discovery_source?: "catalog" | "registry" | "synthesized" | "registered";
  discovered_for?: string;
}

export function classifyAgentRoster(
  subject: RosterClassSubject,
): AgentRosterClass {
  if (CANONICAL_V0_IDS.has(subject.agent_id)) return "canonical_v0";
  if (DEMO_EXTENSION_IDS.has(subject.agent_id)) return "demo_extension";
  if (subject.discovered_for === CONTACT_CATALOG_DISCOVERED_FOR) {
    return "discovered_contact";
  }
  if (
    subject.discovered &&
    (subject.discovery_source === "registry" ||
      subject.discovery_source === "synthesized" ||
      subject.discovery_source === "registered")
  ) {
    return "discovered_contact";
  }
  if (subject.discovered && !subject.discovery_source) {
    return "discovered_contact";
  }
  return "post_v0_integration";
}

export function rosterMetadataFor(subject: RosterClassSubject) {
  const roster_class = classifyAgentRoster(subject);
  return {
    roster_class,
    roster_label: ROSTER_CLASS_LABELS[roster_class],
    roster_description: ROSTER_CLASS_DESCRIPTIONS[roster_class],
    canonical_v0: roster_class === "canonical_v0",
  };
}

export function rosterClassSortValue(rosterClass: AgentRosterClass): number {
  const index = ROSTER_CLASS_ORDER.indexOf(rosterClass);
  return index === -1 ? ROSTER_CLASS_ORDER.length : index;
}

export function compareRosterClass(
  a: RosterClassSubject,
  b: RosterClassSubject,
): number {
  const classDelta =
    rosterClassSortValue(classifyAgentRoster(a)) -
    rosterClassSortValue(classifyAgentRoster(b));
  return classDelta || a.agent_id.localeCompare(b.agent_id);
}
