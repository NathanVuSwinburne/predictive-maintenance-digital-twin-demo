import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireAuth } from "@/components/auth/require-auth";

const authMock = vi.hoisted(() => ({
  isBootstrapping: false,
  isAuthenticated: true,
}));

vi.mock("@/components/auth/auth-context", () => ({
  useAuth: () => authMock,
}));

describe("RequireAuth", () => {
  beforeEach(() => {
    authMock.isBootstrapping = false;
    authMock.isAuthenticated = true;
    globalThis.__nextNavigationMock.pathname = "/machines";
  });

  it("renders a skeleton while auth state is bootstrapping", () => {
    authMock.isBootstrapping = true;

    render(
      <RequireAuth>
        <p>Protected content</p>
      </RequireAuth>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("redirects unauthenticated users with the current path as next", async () => {
    authMock.isAuthenticated = false;

    render(
      <RequireAuth>
        <p>Protected content</p>
      </RequireAuth>,
    );

    await waitFor(() =>
      expect(
        globalThis.__nextNavigationMock.router.replace,
      ).toHaveBeenCalledWith("/login?next=%2Fmachines"),
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders protected children for authenticated users", () => {
    render(
      <RequireAuth>
        <p>Protected content</p>
      </RequireAuth>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(
      globalThis.__nextNavigationMock.router.replace,
    ).not.toHaveBeenCalled();
  });
});
