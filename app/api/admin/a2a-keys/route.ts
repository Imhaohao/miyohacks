/**
 * Admin console A2A outbound-key management.
 *
 * POST { agent_id, api_key, header_name? } -> store/overwrite a key in the
 *   Convex vault (a2a_outbound_keys). The chat route and the auction hydrate
 *   auth from this vault at call time, so a pasted key works immediately.
 * GET -> masked listing (never returns key material).
 * DELETE { agent_id } -> remove a stored key.
 */

import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { jsonOk, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function convex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export async function GET() {
  const keys = await convex().query(api.a2aOutboundKeys.listMasked, {});
  return jsonOk({ keys });
}

export async function POST(req: NextRequest) {
  let body: { agent_id?: string; api_key?: string; header_name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "invalid JSON body" }, 400);
  }
  const { agent_id, api_key, header_name } = body;
  if (!agent_id || !api_key?.trim()) {
    return jsonOk({ ok: false, error: "agent_id and api_key are required" }, 400);
  }
  const res = await convex().mutation(api.a2aOutboundKeys.setKey, {
    agent_id,
    api_key: api_key.trim(),
    header_name,
    source: "user_paste",
  });
  return jsonOk({ ok: true, ...res });
}

export async function DELETE(req: NextRequest) {
  let body: { agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "invalid JSON body" }, 400);
  }
  if (!body.agent_id) {
    return jsonOk({ ok: false, error: "agent_id is required" }, 400);
  }
  const res = await convex().mutation(api.a2aOutboundKeys.removeKey, {
    agent_id: body.agent_id,
  });
  return jsonOk({ ok: true, ...res });
}

export function OPTIONS() {
  return corsPreflight();
}
