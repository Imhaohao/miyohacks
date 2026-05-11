import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { adminSecret, convexAdmin, requireAdminRequest } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = requireAdminRequest(req);
  if (!admin.ok) return admin.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const paymentStatus = url.searchParams.get("payment_status") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const data = await convexAdmin().query(api.admin.tasks, {
    admin_secret: adminSecret(),
    status,
    payment_status: paymentStatus,
    limit: Number.isFinite(limit) ? limit : 100,
  });
  return NextResponse.json(data);
}
