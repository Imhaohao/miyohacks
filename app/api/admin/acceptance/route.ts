import { NextRequest, NextResponse } from "next/server";
import { makeFunctionReference } from "convex/server";
import { adminSecret, convexAdmin, requireAdminRequest } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Use makeFunctionReference instead of the typed `api.acceptance.*` so this
// route still compiles before `npx convex dev` has regenerated the API client.
const LATEST = makeFunctionReference<"query">("acceptance:latestSnapshot");
const RELEASE_GATE = makeFunctionReference<"query">(
  "acceptance:releaseGateFromLatest",
);

export async function GET(req: NextRequest) {
  const admin = requireAdminRequest(req);
  if (!admin.ok) return admin.response;
  const client = convexAdmin();
  const [snapshot, releaseGate] = await Promise.all([
    client.query(LATEST, { admin_secret: adminSecret() }),
    client.query(RELEASE_GATE, { admin_secret: adminSecret() }),
  ]);
  return NextResponse.json({ snapshot, releaseGate });
}
