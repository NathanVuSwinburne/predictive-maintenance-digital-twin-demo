import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { MfaForm } from "@/components/auth/mfa-form";
import { testSessions } from "@/test/fixtures/domain";

const authMock = vi.hoisted(() => ({
  isBootstrapping: false,
  isAuthenticated: false,
  pendingMfaToken: null as string | null,
  pendingMfaMethods: [] as Array<"totp" | "backup-code">,
  login: vi.fn(),
  verifyMfa: vi.fn(),
}));

vi.mock("@/components/auth/auth-context", () => ({
  useAuth: () => authMock,
}));

describe("auth forms", () => {
  beforeEach(() => {
    authMock.isBootstrapping = false;
    authMock.isAuthenticated = false;
    authMock.pendingMfaToken = null;
    authMock.pendingMfaMethods = [];
    authMock.login.mockReset();
    authMock.verifyMfa.mockReset();
  });

  it("logs in a non-MFA user and refreshes the requested route", async () => {
    authMock.login.mockResolvedValue({
      requiresMfa: false,
      session: testSessions.user,
      mfaToken: null,
      availableMethods: [],
    });

    render(<LoginForm nextPath="/machines" />);

    await userEvent.type(screen.getByLabelText("Email"), "test2@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "password2");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(globalThis.__nextNavigationMock.router.push).toHaveBeenCalledWith(
        "/machines",
      ),
    );
    expect(globalThis.__nextNavigationMock.router.refresh).toHaveBeenCalled();
  });

  it("routes an MFA challenge to the MFA page with the original next path", async () => {
    authMock.login.mockResolvedValue({
      requiresMfa: true,
      session: null,
      mfaToken: "mfa-admin",
      availableMethods: ["totp", "backup-code"],
    });

    render(<LoginForm nextPath="/admin" />);

    await userEvent.type(screen.getByLabelText("Email"), "test1@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(globalThis.__nextNavigationMock.router.push).toHaveBeenCalledWith(
        "/login/mfa?next=%2Fadmin",
      ),
    );
  });

  it("renders a readable sign-in error", async () => {
    authMock.login.mockRejectedValue(new Error("Invalid credentials"));

    render(<LoginForm nextPath="/dashboard" />);

    await userEvent.type(screen.getByLabelText("Email"), "wrong@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "bad-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("verifies MFA with a backup code and refreshes the requested route", async () => {
    authMock.pendingMfaToken = "mfa-admin";
    authMock.pendingMfaMethods = ["backup-code"];
    authMock.verifyMfa.mockResolvedValue(undefined);

    render(<MfaForm nextPath="/admin" />);

    await userEvent.type(screen.getByLabelText("Backup code"), "BKP-001-0001");
    await userEvent.click(
      screen.getByRole("button", { name: "Complete sign in" }),
    );

    await waitFor(() =>
      expect(authMock.verifyMfa).toHaveBeenCalledWith({
        method: "backup-code",
        code: "BKP-001-0001",
      }),
    );
    expect(globalThis.__nextNavigationMock.router.push).toHaveBeenCalledWith(
      "/admin",
    );
    expect(globalThis.__nextNavigationMock.router.refresh).toHaveBeenCalled();
  });

  it("sends users without a pending MFA token back to login", async () => {
    render(<MfaForm nextPath="/dashboard" />);

    await waitFor(() =>
      expect(globalThis.__nextNavigationMock.router.replace).toHaveBeenCalledWith(
        "/login",
      ),
    );
  });
});
