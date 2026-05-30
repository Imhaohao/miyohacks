import crypto from "node:crypto";

/**
 * HMAC + hashing primitives for signed A2A inbound callbacks.
 *
 * Canonical string is `${body}\n${timestamp}\n${nonce}`. The body is the
 * raw request bytes — callers MUST pass `await req.text()`, not the parsed
 * JSON, to avoid sort-key ambiguity.
 *
 * Secrets are base64-encoded random bytes (≥32 bytes recommended).
 */

export function canonicalString(
  body: string,
  timestamp: string,
  nonce: string,
): string {
  return `${body}\n${timestamp}\n${nonce}`;
}

export function computeSignature(
  secret_b64: string,
  canonical: string,
): string {
  const key = Buffer.from(secret_b64, "base64");
  return crypto
    .createHmac("sha256", key)
    .update(canonical, "utf8")
    .digest("hex");
}

export function verifySignature(
  secret_b64: string,
  canonical: string,
  signature: string,
): boolean {
  if (!signature) return false;
  const expected = computeSignature(secret_b64, canonical);
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

export function sha256Hex(text: string): string {
  return (
    "sha256:" + crypto.createHash("sha256").update(text, "utf8").digest("hex")
  );
}
