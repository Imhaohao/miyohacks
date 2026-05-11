import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  createSignedAdminSession,
  parseSignedAdminSession,
  verifySecret,
} from "@/lib/admin-session";

export const ADMIN_COOKIE_NAME = "arbor_admin";
const DEFAULT_TTL_HOURS = 12;

function secret() {
  const value = process.env.ADMIN_DASHBOARD_SECRET;
  if (!value) throw new Error("ADMIN_DASHBOARD_SECRET is not set");
  return value;
}

function ttlMs() {
  const hours = Number(process.env.ADMIN_SESSION_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  return Math.max(1, Number.isFinite(hours) ? hours : DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
}

export function verifyAdminSecret(candidate: string) {
  return verifySecret(candidate, secret());
}

export function createAdminSession(actor = "admin") {
  return createSignedAdminSession({
    actor,
    expiresAt: Date.now() + ttlMs(),
    secret: secret(),
  });
}

export function parseAdminSession(token: string | undefined) {
  return parseSignedAdminSession(token, secret());
}

export async function currentAdminFromCookies() {
  const store = await cookies();
  try {
    return parseAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

export function currentAdminFromRequest(req: NextRequest) {
  try {
    return parseAdminSession(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttlMs() / 1000),
  };
}
