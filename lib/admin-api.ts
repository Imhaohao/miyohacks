import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { currentAdminFromRequest } from "@/lib/admin-auth";

export function convexAdmin() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  return new ConvexHttpClient(url);
}

export function adminSecret() {
  const secret = process.env.ADMIN_DASHBOARD_SECRET;
  if (!secret) throw new Error("ADMIN_DASHBOARD_SECRET is not set");
  return secret;
}

export function adminActor(req: NextRequest) {
  const session = currentAdminFromRequest(req);
  if (!session) return null;
  return session.actor;
}

export function requireAdminRequest(req: NextRequest) {
  const actor = adminActor(req);
  if (!actor) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true as const, actor };
}

export async function logAdminEvent(args: {
  actor: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  payload: unknown;
}) {
  return await convexAdmin().mutation(api.admin.logEvent, {
    admin_secret: adminSecret(),
    ...args,
  });
}
