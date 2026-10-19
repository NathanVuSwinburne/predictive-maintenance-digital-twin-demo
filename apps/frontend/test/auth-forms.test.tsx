import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { MfaForm } from "@/components/auth/mfa-form";
import { ApiError } from "@/lib/data/fastapi-provider";
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

    await userEvent.type(screen.getByLabelText("Username"), "test2@test.com");
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

    await userEvent.type(screen.getByLabelText("Username"), "test1@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(globalThis.__nextNavigationMock.router.push).toHaveBeenCalledWith(
        "/login/mfa?next=%2Fadmin",
      ),
    );
  });

  it("renders a readable sign-in error", async () => {
    authMock.login.mockRejectedValue(new ApiError({
      status: 401,
      path: "/api/v1/auth/login",
      detail: "Invalid credentials",
      rawBody: '{"detail":"Invalid credentials"}',
    }));

    render(<LoginForm nextPath="/dashboard" />);

    await userEvent.type(screen.getByLabelText("Username"), "wrong@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "bad-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(screen.getByText("Check your username and password and try again.")).toBeInTheDocument();
    expect(screen.queryByText(/FastAPI|401|\/api\/v1/)).not.toBeInTheDocument();
  });

  it("renders an actionable MFA error without exposing the response", async () => {
    authMock.pendingMfaToken = "mfa-admin";
    authMock.pendingMfaMethods = ["totp", "backup-code"];
    authMock.verifyMfa.mockRejectedValue(new ApiError({
      status: 401,
      path: "/api/v1/auth/mfa/verify",
      detail: "Invalid MFA code.",
      rawBody: '{"detail":"Invalid MFA code."}',
    }));

    render(<MfaForm nextPath="/dashboard" />);
    await userEvent.type(screen.getByLabelText("Authenticator code"), "123454");
    await userEvent.click(screen.getByRole("button", { name: "Complete sign in" }));

    expect(await screen.findByText("Invalid code")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Check the code in your authenticator app and try again, or use a backup code.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/FastAPI|401|\/api\/v1/)).not.toBeInTheDocument();
  });

  it.each(["suspended", "deactivated"])("explains a %s account sign-in rejection", async (status) => {
    authMock.login.mockRejectedValue(new ApiError({ status: 403, detail: { code: `account_${status}` } }));
    render(<LoginForm nextPath="/dashboard" />);
    await userEvent.type(screen.getByLabelText("Username"), "test2@test.com");
    await userEvent.type(screen.getByLabelText("Password"), "password2");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(`Account ${status}`)).toBeVisible();
    expect(screen.getByText("Contact an administrator to restore access.")).toBeVisible();
    expect(globalThis.__nextNavigationMock.router.push).not.toHaveBeenCalled();
  });

  it("uses the same striped backdrop for login and MFA", () => {
    authMock.pendingMfaToken = "mfa-admin";
    authMock.pendingMfaMethods = ["totp", "backup-code"];

    const { container } = render(
      <>
        <LoginForm nextPath="/dashboard" />
        <MfaForm nextPath="/dashboard" />
      </>,
    );

    const [loginBackground, mfaBackground] = Array.from(container.children);

    expect(mfaBackground.className).toBe(loginBackground.className);
    expect(mfaBackground.className).toContain("repeating-linear-gradient");
  });

  it("reveals backup-code entry from the secondary recovery action", async () => {
    authMock.pendingMfaToken = "mfa-admin";
    authMock.pendingMfaMethods = ["totp", "backup-code"];

    render(<MfaForm nextPath="/dashboard" />);

    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
    expect(screen.queryByText("Verification Method")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Backup code")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Use a backup code instead" }),
    );

    expect(screen.getByLabelText("Backup code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Authenticator code")).not.toBeInTheDocument();
  });

  it("renders Back to sign in without an icon", () => {
    authMock.pendingMfaToken = "mfa-admin";
    authMock.pendingMfaMethods = ["totp"];

    render(<MfaForm nextPath="/dashboard" />);

    const backToLogin = screen.getByRole("link", { name: "Back to sign in" });
    expect(
      within(backToLogin).queryByRole("img", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(backToLogin.querySelector("svg")).toBeNull();
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
