import { NextRequest, NextResponse } from "next/server";

import { MFA_PENDING_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const backendBaseUrl = process.env.SERVER_API_BASE_URL ?? "http://localhost:8000";
const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function cookieOptions(maxAge: number, request: NextRequest) {
  return {
    httpOnly: true,
    secure: request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

function rejectCrossSiteMutation(request: NextRequest) {
  if (!stateChangingMethods.has(request.method)) return false;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const publicOrigin = `${protocol}://${host}`;
  return Boolean(
    (origin && origin !== publicOrigin) ||
      (fetchSite && !["same-origin", "none"].includes(fetchSite)),
  );
}

function publicResponseBody(path: string, payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const body = structuredClone(payload) as Record<string, unknown>;
  if (path === "v1/auth/login") {
    body.mfaToken = body.mfaToken ? "pending" : null;
    if (body.session && typeof body.session === "object") {
      (body.session as Record<string, unknown>).token = "";
    }
  }
  if (path === "v1/auth/mfa/verify" || path === "v1/auth/session") {
    body.token = "";
  }
  if (path === "v1/setup/activate" && body.session && typeof body.session === "object") {
    (body.session as Record<string, unknown>).token = "";
  }
  return body;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (rejectCrossSiteMutation(request)) {
    return NextResponse.json({ detail: "Cross-site request rejected." }, { status: 403 });
  }

  const { path: segments } = await context.params;
  const path = segments.join("/");
  const target = new URL(`/api/${path}${request.nextUrl.search}`, backendBaseUrl);
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const mfaToken = request.cookies.get(MFA_PENDING_COOKIE_NAME)?.value;
  if (path === "v1/auth/logout" && !sessionToken) {
    const response = new NextResponse(null, { status: 204 });
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(MFA_PENDING_COOKIE_NAME);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete("content-length");
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const raw = await request.text();
    if (raw) {
      if (path === "v1/auth/mfa/verify" && mfaToken) {
        body = JSON.stringify({ ...JSON.parse(raw), mfaToken });
      } else if (path === "v1/auth/logout" && sessionToken) {
        body = JSON.stringify({ token: sessionToken });
      } else {
        body = raw;
      }
    } else if (path === "v1/auth/logout" && sessionToken) {
      headers.set("content-type", "application/json");
      body = JSON.stringify({ token: sessionToken });
    }
  }
  if (path === "v1/auth/session" && sessionToken && !target.searchParams.has("token")) {
    target.searchParams.set("token", sessionToken);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
  } catch {
    return NextResponse.json({ detail: "The API service is unavailable." }, { status: 503 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isJson = upstream.status !== 204 && contentType.includes("application/json");
  const payload = isJson ? await upstream.json() : null;
  // Non-JSON bodies (CSV downloads) stream straight through; the file name the
  // backend chose travels in Content-Disposition, so that header is forwarded too.
  const passthroughHeaders: Record<string, string> = { "content-type": contentType };
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) passthroughHeaders["content-disposition"] = contentDisposition;
  const response = upstream.status === 204
    ? new NextResponse(null, { status: 204 })
    : isJson
      ? NextResponse.json(publicResponseBody(path, payload), { status: upstream.status })
      : new NextResponse(upstream.body, { status: upstream.status, headers: passthroughHeaders });
  response.headers.set("Cache-Control", "no-store");

  if (upstream.ok && isJson && payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const session = (data.session ?? (path === "v1/auth/mfa/verify" ? data : null)) as Record<string, unknown> | null;
    if (session && typeof session.token === "string" && session.token) {
      response.cookies.set(SESSION_COOKIE_NAME, session.token, cookieOptions(60 * 60 * 8, request));
      response.cookies.delete(MFA_PENDING_COOKIE_NAME);
    }
    if (path === "v1/auth/login" && typeof data.mfaToken === "string" && data.mfaToken) {
      response.cookies.set(MFA_PENDING_COOKIE_NAME, data.mfaToken, cookieOptions(15 * 60, request));
    }
  }
  if (path === "v1/auth/logout" && upstream.ok) {
    response.cookies.delete(SESSION_COOKIE_NAME);
    response.cookies.delete(MFA_PENDING_COOKIE_NAME);
  }
  if (path === "v1/auth/session" && upstream.ok && isJson && payload === null) {
    response.cookies.delete(SESSION_COOKIE_NAME);
  }
  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
