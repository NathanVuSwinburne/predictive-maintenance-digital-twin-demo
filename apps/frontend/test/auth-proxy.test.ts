import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/[...path]/route";

describe("authentication BFF", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("stores a session in an HttpOnly strict cookie and removes it from JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      requiresMfa: false,
      session: { token: "opaque-session", userId: "user-1", activePersonaId: "persona-1", authenticatedAt: "2026-01-01T00:00:00Z" },
      mfaToken: null,
      availableMethods: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const request = new NextRequest("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email: "admin@example.com", password: "long-password" }),
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "auth", "login"] }) });
    expect((await response.json()).session.token).toBe("");
    expect(response.headers.get("set-cookie")).toContain("pmdt_session=opaque-session");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });

  it("rejects cross-site mutations before forwarding", async () => {
    const request = new NextRequest("http://localhost/api/v1/users/invitations", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: "{}",
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "users", "invitations"] }) });
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks auth cookies secure when the public request used HTTPS", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      requiresMfa: false,
      session: { token: "opaque-session", userId: "user-1", activePersonaId: "persona-1", authenticatedAt: "2026-01-01T00:00:00Z" },
      mfaToken: null,
      availableMethods: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const request = new NextRequest("http://frontend:3000/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ email: "admin@example.com", password: "long-password" }),
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "auth", "login"] }) });
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("accepts a same-origin HTTPS mutation forwarded over the private HTTP network", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "invitation-1" }), { status: 201, headers: { "content-type": "application/json" } }));
    const request = new NextRequest("http://frontend:3000/api/v1/users/invitations", {
      method: "POST",
      headers: {
        origin: "https://maintenance.example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "maintenance.example.com",
        "content-type": "application/json",
      },
      body: "{}",
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "users", "invitations"] }) });
    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("clears an expired server session cookie", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("null", { status: 200, headers: { "content-type": "application/json" } }));
    const request = new NextRequest("http://localhost/api/v1/auth/session", { headers: { cookie: "pmdt_session=expired-token" } });
    const response = await GET(request, { params: Promise.resolve({ path: ["v1", "auth", "session"] }) });
    expect(response.headers.get("set-cookie")).toContain("pmdt_session=;");
  });

  it("forwards an empty 204 response without constructing an invalid body", async () => {
    // FastAPI retains the JSON content type on its bodyless logout response.
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204, headers: { "content-type": "application/json" } }));
    const request = new NextRequest("http://localhost/api/v1/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost", cookie: "pmdt_session=opaque-session" },
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["v1", "auth", "logout"] }) });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("set-cookie")).toContain("pmdt_session=;");
  });

  it("forwards event-stream chunks before the upstream stream finishes", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(new TextEncoder().encode("data: first\n\n")); } });
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    const pending = POST(new NextRequest("http://localhost/api/v1/chat/messages/stream", { method: "POST", headers: { origin: "http://localhost" }, body: "{}" }), { params: Promise.resolve({ path: ["v1", "chat", "messages", "stream"] }) });
    const response = await Promise.race([pending, new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))]);
    controller.close();
    await pending;
    expect(response).not.toBeNull();
    const reader = response!.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: first\n\n");
  });

  it("treats logout with no session cookie as already signed out", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"detail":"token required"}', { status: 422, headers: { "content-type": "application/json" } }));
    const response = await POST(new NextRequest("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin: "http://localhost" }, body: "{}" }), { params: Promise.resolve({ path: ["v1", "auth", "logout"] }) });
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("pmdt_mfa_pending=;");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves cookie state if the backend rejects logout, allowing a real retry", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"detail":"unavailable"}', { status: 503, headers: { "content-type": "application/json" } }));
    const response = await POST(new NextRequest("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin: "http://localhost", cookie: "pmdt_session=opaque-session" } }), { params: Promise.resolve({ path: ["v1", "auth", "logout"] }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("streams a CSV download with its file name and the session bearer", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("timestamp,session_id\r\n"));
        controller.enqueue(encoder.encode("2026-09-01T00:00:00+00:00,run-1\r\n"));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValue(new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="pump-run-a-telemetry.csv"',
      },
    }));
    const request = new NextRequest("http://localhost/api/v1/entities/pump/telemetry.csv?recordingId=rec-1", {
      headers: { cookie: "pmdt_session=opaque-session" },
    });
    const response = await GET(request, { params: Promise.resolve({ path: ["v1", "entities", "pump", "telemetry.csv"] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="pump-run-a-telemetry.csv"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("timestamp,session_id\r\n2026-09-01T00:00:00+00:00,run-1\r\n");
    const [target, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(target)).toContain("/api/v1/entities/pump/telemetry.csv?recordingId=rec-1");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer opaque-session");
  });
});
