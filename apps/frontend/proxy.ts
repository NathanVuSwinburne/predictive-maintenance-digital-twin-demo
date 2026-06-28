import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session"

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/machines",
  "/history",
  "/chat",
  "/simulator",
  "/admin",
]

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value)
  const hasPendingMfa = Boolean(request.cookies.get(MFA_PENDING_COOKIE_NAME)?.value)

  if (pathname === "/") {
    return NextResponse.next()
  }

  if (isProtectedPath(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname.startsWith("/login") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  if (pathname === "/login/mfa" && !hasSession && !hasPendingMfa) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
