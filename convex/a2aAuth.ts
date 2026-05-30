"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { canonicalString, verifySignature } from "../lib/a2a-hmac";

const MAX_DRIFT_SECONDS = 300; // 5 minutes
const NONCE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export type VerifyVerdict =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 403;
      error:
        | "missing_headers"
        | "invalid_timestamp"
        | "timestamp_drift"
        | "unknown_agent"
        | "invalid_signature"
        | "nonce_replay";
      detail?: string;
    };

/**
 * Public entrypoint for verifying a signed inbound A2A callback. The route
 * handler hands in the raw request body and the four signing headers; this
 * action performs the full verification against the agent's stored secret
 * and records the nonce so replays fail.
 *
 * Internal queries (_getSecretForAgent, _seenOrInsert) stay internal so
 * nothing outside Convex can flood the nonce table or probe the agent
 * registry directly. This action is the only public surface.
 */
export const verifyInboundCallback = action({
  args: {
    raw_body: v.string(),
    agent_id: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    nonce: v.optional(v.string()),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VerifyVerdict> => {
    const missing: string[] = [];
    if (!args.agent_id) missing.push("X-Arbor-Agent");
    if (!args.timestamp) missing.push("X-Arbor-Timestamp");
    if (!args.nonce) missing.push("X-Arbor-Nonce");
    if (!args.signature) missing.push("X-Arbor-Signature");
    if (missing.length > 0) {
      return {
        ok: false,
        status: 401,
        error: "missing_headers",
        detail: missing.join(", "),
      };
    }
    const tsNum = Number.parseInt(args.timestamp!, 10);
    if (!Number.isFinite(tsNum)) {
      return {
        ok: false,
        status: 403,
        error: "invalid_timestamp",
        detail: args.timestamp,
      };
    }
    const driftSeconds = Math.abs(Date.now() / 1000 - tsNum);
    if (driftSeconds > MAX_DRIFT_SECONDS) {
      return {
        ok: false,
        status: 403,
        error: "timestamp_drift",
        detail: `drift=${Math.round(driftSeconds)}s`,
      };
    }
    const keyRow = await ctx.runQuery(internal.agentKeys._getSecretForAgent, {
      agent_id: args.agent_id!,
    });
    if (!keyRow) {
      return { ok: false, status: 403, error: "unknown_agent" };
    }
    const canonical = canonicalString(args.raw_body, args.timestamp!, args.nonce!);
    if (!verifySignature(keyRow.secret_b64, canonical, args.signature!)) {
      return { ok: false, status: 403, error: "invalid_signature" };
    }
    const replay = await ctx.runMutation(internal.a2aNonces._seenOrInsert, {
      nonce: args.nonce!,
      agent_id: args.agent_id!,
      created_at: Date.now(),
    });
    if (replay) {
      return { ok: false, status: 403, error: "nonce_replay" };
    }
    // Opportunistic cleanup — cheap, only triggers when retention window has
    // moved. Errors here are non-fatal; the request is already verified.
    await ctx
      .runMutation(internal.a2aNonces._cleanupOlderThan, {
        cutoff_ms: Date.now() - NONCE_RETENTION_MS,
      })
      .catch(() => {});
    return { ok: true };
  },
});
