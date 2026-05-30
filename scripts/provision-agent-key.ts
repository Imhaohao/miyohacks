// Usage: npx tsx scripts/provision-agent-key.ts <agent_id>
//
// Requires:
//   CONVEX_URL          — the deployment URL (https://<slug>.convex.cloud)
//   ARBOR_ADMIN_TOKEN   — must match the token set in the Convex deployment env
//
// Generates a fresh 32-byte HMAC secret for the named agent and inserts it
// via the admin-gated provisioning action. Prints the secret_b64 exactly
// once — hand it to the agent operator over a secure channel.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  const adminToken = process.env.ARBOR_ADMIN_TOKEN;
  const agentId = process.argv[2];

  if (!convexUrl) throw new Error("CONVEX_URL is not set");
  if (!adminToken) throw new Error("ARBOR_ADMIN_TOKEN is not set");
  if (!agentId)
    throw new Error("Missing argument: agent_id (npx tsx scripts/provision-agent-key.ts <agent_id>)");

  const client = new ConvexHttpClient(convexUrl);
  const result = await client.action(api.agentKeysAdmin.provision, {
    agent_id: agentId,
    admin_token: adminToken,
  });

  console.log(`Provisioned HMAC secret for agent: ${result.agent_id}`);
  console.log(`Created at:  ${new Date(result.created_at).toISOString()}`);
  console.log("");
  console.log("Share this secret over a secure channel — it is shown ONCE:");
  console.log(result.secret_b64);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
