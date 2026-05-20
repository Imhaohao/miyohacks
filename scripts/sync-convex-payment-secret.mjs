#!/usr/bin/env node
/**
 * Copies PAYMENT_SERVER_SECRET from .env.local to the active Convex deployment.
 * Next.js and Convex must share the same value for wallet/account mutations.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

let secret;
try {
  const raw = readFileSync(envPath, "utf8");
  const match = raw.match(/^PAYMENT_SERVER_SECRET=(.+)$/m);
  secret = match?.[1]?.trim();
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

if (!secret) {
  console.error("PAYMENT_SERVER_SECRET is missing in .env.local");
  process.exit(1);
}

const polyfill = join(root, "scripts/node-styleText-polyfill.cjs");
const nodeOptions = process.env.NODE_OPTIONS
  ? `${process.env.NODE_OPTIONS} --require ${polyfill}`
  : `--require ${polyfill}`;

const result = spawnSync(
  "npx",
  ["convex", "env", "set", "PAYMENT_SERVER_SECRET", secret],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  },
);

process.exit(result.status ?? 1);
