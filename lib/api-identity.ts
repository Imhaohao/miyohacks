import "server-only";

import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { hashApiKey } from "@/lib/api-keys";
import { currentClerkAccount } from "@/lib/clerk-account";
import { paymentServerSecret } from "@/lib/stripe";

export interface ApiCallerIdentity {
  account_id: string;
  project_id?: Id<"projects">;
  agent_id: string;
  source: "api_key" | "clerk" | "legacy";
}

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function resolveApiIdentity(
  req: NextRequest,
): Promise<ApiCallerIdentity | null> {
  const token = bearerToken(req);
  if (token?.startsWith("arbor_")) {
    const result = await convex().mutation(api.apiKeys.validate, {
      server_secret: paymentServerSecret(),
      token_hash: hashApiKey(token),
    });
    if (!result) return null;
    return {
      account_id: result.account_id,
      project_id: result.project_id,
      agent_id: `api-key:${result.name}`,
      source: "api_key",
    };
  }

  const account = await currentClerkAccount();
  if (account) {
    const ensured = await convex().mutation(api.accounts.ensureByClerkUser, {
      server_secret: paymentServerSecret(),
      clerk_user_id: account.clerk_user_id,
      email: account.email,
      display_name: account.display_name,
      avatar_url: account.avatar_url,
    });
    return {
      account_id: account.account_id,
      project_id: ensured.default_project._id,
      agent_id: account.account_id,
      source: "clerk",
    };
  }

  if (process.env.ALLOW_LEGACY_AGENT_IDS === "true") {
    return {
      account_id: "agent:mcp",
      agent_id: "agent:mcp",
      source: "legacy",
    };
  }

  return null;
}
