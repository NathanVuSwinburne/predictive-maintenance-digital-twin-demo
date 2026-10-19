import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MFA_PENDING_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function GET() {
  const store = await cookies();
  return NextResponse.json({
    hasSession: store.has(SESSION_COOKIE_NAME),
    hasPendingMfa: store.has(MFA_PENDING_COOKIE_NAME),
  });
}
