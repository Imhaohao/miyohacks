import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { adminSecret, convexAdmin, requireAdminRequest } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = requireAdminRequest(req);
  if (!admin.ok) return admin.response;
  const data = await convexAdmin().query(api.admin.agents, {
    admin_secret: adminSecret(),
  });
  return NextResponse.json(data);
}
