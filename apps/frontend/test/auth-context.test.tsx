import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/components/auth/auth-context";
import {
  AUTH_STORAGE_KEY,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import {
  testSessions,
  testUsers,
} from "@/test/fixtures/domain";

const providerMock = vi.hoisted(() => ({
  login: vi.fn(),
  verifyMfa: vi.fn(),
  logout: vi.fn(),
  getSession: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => providerMock,
}));

function AuthProbe() {
  const auth = useAuth();

  return (
    <div>
      <p data-testid="bootstrapping">{String(auth.isBootstrapping)}</p>
      <p data-testid="authenticated">{String(auth.isAuthenticated)}</p>
      <p data-testid="active-persona">{auth.activePersona?.email ?? "none"}</p>
      <p data-testid="pending-mfa">{auth.pendingMfaToken ?? "none"}</p>
      <button
        type="button"
        onClick={() => {
          void auth.login({ email: "test1@test.com", password: "password1" });
        }}
      >
        Login admin
      </button>
      <button
        type="button"
        onClick={() => {
          void auth
            .verifyMfa({ method: "backup-code", code: "BKP-001-0001" })
            .catch(() => undefined);
        }}
      >
        Verify MFA
      </button>
      <button
        type="button"
        onClick={() => {
          void auth.logout();
        }}
      >
        Logout
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    providerMock.login.mockReset();
    providerMock.verifyMfa.mockReset();
    providerMock.logout.mockReset();
    providerMock.getSession.mockReset();
    providerMock.listUsers.mockReset();
    providerMock.listUsers.mockResolvedValue(testUsers);
  });

  it("bootstraps a persisted valid session into cookies and active persona", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        session: testSessions.user,
        pendingMfaToken: null,
        pendingMfaMethods: [],
      }),
    );
    providerMock.getSession.mockResolvedValue(testSessions.user);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("active-persona")).toHaveTextContent(
      "test2@test.com",
    );
    expect(document.cookie).toContain(`${SESSION_COOKIE_NAME}=token-user`);
    expect(providerMock.getSession).toHaveBeenCalledWith("token-user");
  });

  it("clears an invalid persisted session while preserving pending MFA", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        session: testSessions.user,
        pendingMfaToken: "mfa-admin",
        pendingMfaMethods: ["totp", "backup-code"],
      }),
    );
    providerMock.getSession.mockResolvedValue(null);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("pending-mfa")).toHaveTextContent("mfa-admin");
    expect(document.cookie).not.toContain(`${SESSION_COOKIE_NAME}=`);
    expect(document.cookie).toContain(`${MFA_PENDING_COOKIE_NAME}=mfa-admin`);
  });

  it("stores a pending MFA challenge from login", async () => {
    providerMock.login.mockResolvedValue({
      requiresMfa: true,
      session: null,
      mfaToken: "mfa-admin",
      availableMethods: ["totp", "backup-code"],
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Login admin" }));

    await waitFor(() =>
      expect(screen.getByTestId("pending-mfa")).toHaveTextContent("mfa-admin"),
    );
    expect(document.cookie).toContain(`${MFA_PENDING_COOKIE_NAME}=mfa-admin`);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain("mfa-admin");
  });

  it("verifies MFA, writes the session cookie, and clears pending MFA state", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        session: null,
        pendingMfaToken: "mfa-admin",
        pendingMfaMethods: ["backup-code"],
      }),
    );
    providerMock.verifyMfa.mockResolvedValue(testSessions.admin);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("pending-mfa")).toHaveTextContent("mfa-admin"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify MFA" }));

    await waitFor(() =>
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true"),
    );
    expect(providerMock.verifyMfa).toHaveBeenCalledWith({
      mfaToken: "mfa-admin",
      method: "backup-code",
      code: "BKP-001-0001",
    });
    expect(document.cookie).toContain(`${SESSION_COOKIE_NAME}=token-admin`);
    expect(document.cookie).not.toContain(`${MFA_PENDING_COOKIE_NAME}=`);
  });

  it("resets a dead MFA token when the backend reports it expired", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        session: null,
        pendingMfaToken: "mfa-dead",
        pendingMfaMethods: ["backup-code"],
      }),
    );
    providerMock.verifyMfa.mockRejectedValue(
      new Error("Invalid or expired MFA token"),
    );

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("pending-mfa")).toHaveTextContent("mfa-dead"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Verify MFA" }));

    await waitFor(() =>
      expect(screen.getByTestId("pending-mfa")).toHaveTextContent("none"),
    );
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).not.toContain("mfa-dead");
  });

  it("logs out through the provider and clears persisted auth", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        session: testSessions.user,
        pendingMfaToken: null,
        pendingMfaMethods: [],
      }),
    );
    providerMock.getSession.mockResolvedValue(testSessions.user);
    providerMock.logout.mockResolvedValue(undefined);

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("authenticated")).toHaveTextContent("false"),
    );
    expect(providerMock.logout).toHaveBeenCalledWith("token-user");
    expect(document.cookie).not.toContain(`${SESSION_COOKIE_NAME}=`);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain('"session":null');
  });
});
