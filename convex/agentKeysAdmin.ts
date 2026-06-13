"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import crypto from "node:crypto";

/**
 * Admin-gated provisioning of a fresh per-agent HMAC secret.
 *
 * Returns the secret_b64 exactly once. The operator is responsible for
 * delivering it to the agent over a secure channel. There is no way to
 * recover the secret later — re-provisioning rotates it.
 *
 * Auth: ARBOR_ADMIN_TOKEN env var must be set on the Convex deployment and
 * also passed in the call. The token is constant-time compared.
 */
export const provision = action({
  args: {
    agent_id: v.string(),
    admin_token: v.string(),
  },
  handler: async (ctx, args) => {
    const adminToken = process.env.ARBOR_ADMIN_TOKEN;
    if (!adminToken) {
      throw new Error(
        "ARBOR_ADMIN_TOKEN is not set on the Convex deployment — refusing to provision",
      );
    }
    const a = Buffer.from(adminToken, "utf8");
    const b = Buffer.from(args.admin_token, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("forbidden");
    }
    const bytes = crypto.randomBytes(32);
    const secret_b64 = bytes.toString("base64");
    const created_at = Date.now();
    await ctx.runMutation(internal.agentKeys._rotate, {
      agent_id: args.agent_id,
      secret_b64,
      created_at,
    });
    return { agent_id: args.agent_id, secret_b64, created_at };
  },
});
