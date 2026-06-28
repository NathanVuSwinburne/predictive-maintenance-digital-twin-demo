import { beforeEach, describe, expect, it, vi } from "vitest";

import { FastApiDigitalTwinProvider } from "@/lib/data/fastapi-provider";

describe("FastApiDigitalTwinProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("builds listMachines query parameters and injects the cookie auth token", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const provider = new FastApiDigitalTwinProvider("http://api.test");

    await provider.listMachines({
      search: "Machine C",
      line: "Line 3",
      status: "risk",
      sortBy: "risk",
      sortDirection: "desc",
      authorizedForUserId: "user-002",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      "http://api.test/api/v1/machines?search=Machine+C&line=Line+3&status=risk&sort_by=risk&sort_direction=desc&authorized_for_user_id=user-002",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer token-user",
    );
  });

  it("sends BYOK chat headers without dropping auth", async () => {
    document.cookie = "pmdt_session=token-user; path=/";
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ thread: {}, messages: [] }), {
        status: 200,
      }),
    );
    const provider = new FastApiDigitalTwinProvider("");

    await provider.sendMessage({
      threadId: "thread-1",
      userId: "user-002",
      text: "Check Machine C",
      apiKey: "sk-test",
      llmProvider: "openai",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-user");
    expect(headers.get("X-API-Key")).toBe("sk-test");
    expect(headers.get("X-LLM-Provider")).toBe("openai");
  });

  it("returns undefined for no-content responses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    const provider = new FastApiDigitalTwinProvider("");

    await expect(provider.logout("token-user")).resolves.toBeUndefined();
  });

  it("throws a descriptive error for failed API responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Nope", { status: 403 }),
    );
    const provider = new FastApiDigitalTwinProvider("");

    await expect(provider.listUsers()).rejects.toThrow(
      "FastAPI request failed (403) for /api/v1/users: Nope",
    );
  });
});
