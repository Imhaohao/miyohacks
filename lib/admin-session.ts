import { createHmac, timingSafeEqual } from "node:crypto";

export interface AdminSessionPayload {
  actor: string;
  exp: number;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySecret(candidate: string, secret: string) {
  return safeEqual(candidate, secret);
}

export function createSignedAdminSession(args: {
  actor: string;
  expiresAt: number;
  secret: string;
}) {
  const payload: AdminSessionPayload = {
    actor: args.actor,
    exp: args.expiresAt,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, args.secret)}`;
}

export function parseSignedAdminSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): AdminSessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded, secret))) {
    return null;
  }
  try {
    const payload = JSON.parse(decode(encoded)) as AdminSessionPayload;
    if (!payload.actor || typeof payload.exp !== "number") return null;
    if (payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
