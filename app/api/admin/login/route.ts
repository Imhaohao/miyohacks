import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  adminCookieOptions,
  createAdminSession,
  verifyAdminSecret,
} from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginBody {
  secret?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as LoginBody;
  const candidate = body.secret ?? "";
  if (!candidate || !verifyAdminSecret(candidate)) {
    return NextResponse.json({ error: "invalid admin secret" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_COOKIE_NAME,
    createAdminSession("admin"),
    adminCookieOptions(),
  );
  return response;
}
