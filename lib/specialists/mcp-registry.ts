/**
 * Live MCP server registry search.
 *
 * Hits the official MCP registry (registry.modelcontextprotocol.io), which
 * is the open, no-auth source of record for published MCP servers. We filter
 * to HTTP-invocable transports (`streamable-http` or `sse`) because the
 * mcp-forwarding specialist runner only speaks HTTP — stdio packages can't
 * be hosted by us at runtime.
 *
 * Ref: https://github.com/modelcontextprotocol/registry
 */

const DEFAULT_REGISTRY_BASE =
  process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";

export interface RegistryCandidate {
  /** Stable id from the registry. Used as the discovered specialist's agent_id slug source. */
  id: string;
  name: string;
  description: string;
  /** HTTP MCP endpoint URL we can call directly. */
  url: string;
  transport: "streamable-http" | "sse";
  /** Variables the URL template expects (api keys, regions). */
  variables: Record<
    string,
    { description?: string; required?: boolean; default?: string }
  >;
  /** Static headers the server expects (e.g. version pin). */
  headers?: Record<string, string>;
  homepage?: string;
  publisher?: string;
}

interface RawRegistryServer {
  id?: string;
  name?: string;
  description?: string;
  publisher?: { name?: string };
  homepage?: string;
  packages?: Array<{ registryName?: string }>;
  transports?: Array<{
    type?: string;
    url?: string;
    headers?: Record<string, string>;
    variables?: Record<
      string,
      { description?: string; required?: boolean; default?: string }
    >;
  }>;
}

interface RegistryListResponse {
  servers?: RawRegistryServer[];
  metadata?: { count?: number; nextCursor?: string };
}

const SEARCH_TIMEOUT_MS = 8_000;

export async function searchRegistry(
  query: string,
  limit = 10,
): Promise<RegistryCandidate[]> {
  const url = new URL("/v0/servers", DEFAULT_REGISTRY_BASE);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(Math.min(50, Math.max(1, limit))));

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SEARCH_TIMEOUT_MS);
  let json: RegistryListResponse;
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: ctl.signal,
    });
    if (!res.ok) {
      throw new Error(`registry search HTTP ${res.status}`);
    }
    json = (await res.json()) as RegistryListResponse;
  } finally {
    clearTimeout(timer);
  }

  const servers = json.servers ?? [];
  const candidates: RegistryCandidate[] = [];
  for (const s of servers) {
    const transport = pickHttpTransport(s.transports);
    if (!transport || !transport.url) continue;
    const id = s.id ?? s.name;
    if (!id || !s.name) continue;
    candidates.push({
      id,
      name: s.name,
      description: s.description ?? "",
      url: transport.url,
      transport: transport.type === "sse" ? "sse" : "streamable-http",
      variables: transport.variables ?? {},
      headers: transport.headers,
      homepage: s.homepage,
      publisher: s.publisher?.name,
    });
  }
  return candidates;
}

type RawTransport = NonNullable<RawRegistryServer["transports"]>[number];

function pickHttpTransport(
  transports: RawRegistryServer["transports"],
): RawTransport | undefined {
  if (!transports) return undefined;
  return (
    transports.find((t) => t.type === "streamable-http" && t.url) ??
    transports.find((t) => t.type === "sse" && t.url)
  );
}

/**
 * Resolve a registry URL template with caller-supplied variables. Variables
 * the template marks as required but the caller doesn't provide are returned
 * in `missing` so the caller can decide whether to bail.
 */
export function resolveRegistryUrl(
  candidate: RegistryCandidate,
  vars: Record<string, string>,
): { url: string; missing: string[] } {
  const missing: string[] = [];
  const resolved = candidate.url.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    if (key in vars) return vars[key];
    const def = candidate.variables[key]?.default;
    if (typeof def === "string") return def;
    if (candidate.variables[key]?.required) missing.push(key);
    return `{${key}}`;
  });
  return { url: resolved, missing };
}
