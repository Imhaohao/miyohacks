import assert from "node:assert/strict";
import http from "node:http";
import { fetchAgentCard } from "./a2a-agent-card";

// ─── server helpers ───────────────────────────────────────────────────────────

type RouteMap = Record<string, { status: number; body: string }>;

function startServer(routes: RouteMap): Promise<{ base: string; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url ?? ""];
      if (route) {
        res.writeHead(route.status, { "content-type": "application/json" });
        res.end(route.body);
      } else {
        res.writeHead(404);
        res.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ base: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

// ─── test state ───────────────────────────────────────────────────────────────

const servers: http.Server[] = [];

process.exitCode = 1; // set to 0 after all cases pass

(async () => {
  // ── Case 1: v0.3.0 path ─────────────────────────────────────────────────────
  {
    const card = JSON.stringify({ name: "v3-agent", protocolVersion: "0.3.0", security: [] });
    const { base, server } = await startServer({
      "/.well-known/agent-card.json": { status: 200, body: card },
      "/.well-known/agent.json": { status: 404, body: "" },
    });
    servers.push(server);

    const result = await fetchAgentCard(`${base}/rpc`);
    assert.equal(result.name, "v3-agent");
    console.log("ok — Case 1: v0.3.0 path (agent-card.json)");
  }

  // ── Case 2: legacy fallback ──────────────────────────────────────────────────
  // Different port = different origin, so module-level caches are clean.
  {
    const card = JSON.stringify({ name: "legacy-agent", protocolVersion: "0.2.6" });
    const { base, server } = await startServer({
      "/.well-known/agent-card.json": { status: 404, body: "" },
      "/.well-known/agent.json": { status: 200, body: card },
    });
    servers.push(server);

    const result = await fetchAgentCard(`${base}/rpc`);
    assert.equal(result.name, "legacy-agent");
    console.log("ok — Case 2: legacy fallback (agent.json)");

    // ── Case 4: sticky winner (same origin as Case 2) ─────────────────────────
    // Swap the route map to make agent-card.json count-trackable: replace the
    // 404 route with a 200 that would return a different name — if the sticky
    // cache is working, we should NEVER hit agent-card.json again and the name
    // must still be "legacy-agent".
    let newCardJsonHits = 0;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url === "/.well-known/agent-card.json") {
        newCardJsonHits++;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ name: "should-not-appear" }));
      } else if (req.url === "/.well-known/agent.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ name: "legacy-agent" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const result2 = await fetchAgentCard(`${base}/rpc`);
    assert.equal(newCardJsonHits, 0, "agent-card.json must not be re-probed after sticky win");
    assert.equal(result2.name, "legacy-agent");
    console.log("ok — Case 4: sticky winner (no re-probe of agent-card.json)");
  }

  // ── Case 3: explicitUrl ──────────────────────────────────────────────────────
  {
    const card = JSON.stringify({ name: "explicit-agent" });
    const { base, server } = await startServer({
      "/custom/card.json": { status: 200, body: card },
    });
    servers.push(server);

    const result = await fetchAgentCard(`${base}/rpc`, `${base}/custom/card.json`);
    assert.equal(result.name, "explicit-agent");
    console.log("ok — Case 3: explicitUrl override");
  }

  process.exitCode = 0;
})()
  .catch((err) => {
    console.error("FAIL:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const s of servers) s.close();
  });
