import { createHash, randomBytes } from "node:crypto";

export function generateApiKey() {
  return `arbor_${randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
