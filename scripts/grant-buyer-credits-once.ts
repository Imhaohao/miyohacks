import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const email = process.argv[2] ?? "imhaohao@berkeley.edu";
  const amount = Number(process.argv[3] ?? "1000");
  const buyerId =
    process.argv[4] ?? "clerk:user_3DecIoAweZt9kedtEezkC8bzLmr";

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const paymentSecret = process.env.PAYMENT_SERVER_SECRET?.trim();
  if (!convexUrl || !paymentSecret) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL and PAYMENT_SERVER_SECRET are required");
  }

  const grantKey = `admin-manual-grant:${email.trim().toLowerCase()}:${amount}`;
  const client = new ConvexHttpClient(convexUrl);
  const before = await client.query(api.payments.walletForBuyer, {
    buyer_id: buyerId,
  });
  const result = await client.mutation(api.payments.fulfillCheckoutSession, {
    server_secret: paymentSecret,
    buyer_id: buyerId,
    session_id: grantKey,
    amount_usd: 0,
    credits: amount,
    stripe_event_id: grantKey,
  });
  const after = await client.query(api.payments.walletForBuyer, {
    buyer_id: buyerId,
  });

  console.log(
    JSON.stringify(
      { email, buyer_id: buyerId, amount, result, before, after },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
