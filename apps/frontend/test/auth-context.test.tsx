import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/components/auth/auth-context";
import { ActivationForm } from "@/components/auth/activation-form";
import { RequireAuth } from "@/components/auth/require-auth";
import { AUTH_STORAGE_KEY, MFA_PENDING_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { ApiError } from "@/lib/data/fastapi-provider";
import { testSessions, testUsers } from "@/test/fixtures/domain";

const providerMock = vi.hoisted(() => ({ getActivationDetails: vi.fn(), activateInvitation: vi.fn(), login: vi.fn(), verifyMfa: vi.fn(), logout: vi.fn(), getSession: vi.fn(), listUsers: vi.fn() }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => providerMock }));

function Probe() {
  const auth = useAuth();
  return <div><p data-testid="bootstrapping">{String(auth.isBootstrapping)}</p><p data-testid="authenticated">{String(auth.isAuthenticated)}</p><p data-testid="active-persona">{auth.activePersona?.email ?? "none"}</p><p data-testid="pending-mfa">{auth.pendingMfaToken ?? "none"}</p><button onClick={() => void auth.login({ email: "test1@test.com", password: "password1" })}>Login admin</button><button onClick={() => void auth.verifyMfa({ method: "backup-code", code: "BKP-001-0001" }).catch(() => undefined)}>Verify MFA</button><button onClick={() => void auth.logout()}>Logout</button></div>;
}

function renderProvider() { return render(<AuthProvider><Probe /></AuthProvider>); }
function browserState(hasSession = false, hasPendingMfa = false) { vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ hasSession, hasPendingMfa }), { status: 200 })); }

function ActivationProbe() {
  const auth = useAuth();
  return <><Probe /><button onClick={() => void auth.activateInvitation({ token: "test-invitation", password: "long-test-password" })}>Activate</button></>;
}

describe("AuthProvider hardened browser sessions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.values(providerMock).forEach((mock) => mock.mockReset());
    providerMock.listUsers.mockResolvedValue(testUsers);
    localStorage.clear();
    document.cookie = `${SESSION_COOKIE_NAME}=; max-age=0; path=/`;
    document.cookie = `${MFA_PENDING_COOKIE_NAME}=; max-age=0; path=/`;
  });

  it("bootstraps from server cookie state without reading a browser token", async () => {
    browserState(true, false);
    providerMock.getSession.mockResolvedValue({ ...testSessions.user, token: "" });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    expect(screen.getByTestId("active-persona")).toHaveTextContent("test2@test.com");
    expect(providerMock.getSession).toHaveBeenCalledWith();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it("restores only a non-secret pending MFA marker", async () => {
    browserState(false, true);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("pending-mfa")).toHaveTextContent("pending"));
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(MFA_PENDING_COOKIE_NAME);
  });

  it("updates the authenticated persona immediately after invitation activation", async () => {
    browserState();
    providerMock.activateInvitation.mockResolvedValue({ session: { ...testSessions.admin, token: "" }, backupCodes: ["test-recovery-code"] });
    render(<AuthProvider><ActivationProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"));
    await userEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    expect(screen.getByTestId("active-persona")).toHaveTextContent("test1@test.com");
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("does not discard a verified session when loading personas fails", async () => {
    browserState(true);
    providerMock.getSession.mockResolvedValue({ ...testSessions.admin, token: "" });
    providerMock.listUsers.mockRejectedValue(new ApiError({ status: 500, detail: "Profile unavailable" }));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"));
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
  });

  it("returns to login when profile loading discovers a revoked session", async () => {
    browserState(true);
    providerMock.getSession.mockResolvedValueOnce({ ...testSessions.admin, token: "" }).mockResolvedValue(null);
    providerMock.listUsers.mockRejectedValue(new ApiError({ status: 401, detail: "Invalid session" }));
    render(<AuthProvider><Probe /><RequireAuth><p>Private content</p></RequireAuth></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("false"));
    expect(globalThis.__nextNavigationMock.router.replace).toHaveBeenCalledWith("/login?next=%2Fdashboard");
  });

  it.each([{ backupCodes: [] }, { backupCodes: ["test-recovery-code"] }])("the activation form authenticates before dashboard navigation (codes: $backupCodes)", async ({ backupCodes }) => {
    browserState();
    providerMock.getActivationDetails.mockResolvedValue({ name: "Administrator", email: "admin@example.test", role: "admin", requiresMfa: false });
    providerMock.activateInvitation.mockResolvedValue({ session: { ...testSessions.admin, token: "" }, backupCodes });
    render(<AuthProvider><Probe /><ActivationForm token="test-invitation" /></AuthProvider>);
    await userEvent.type(await screen.findByLabelText("Password", { exact: true }), "long-test-password");
    await userEvent.type(screen.getByLabelText("Confirm password"), "long-test-password");
    await userEvent.click(screen.getByRole("button", { name: "Activate account" }));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    if (backupCodes.length) {
      expect(globalThis.__nextNavigationMock.router.push).not.toHaveBeenCalled();
      await userEvent.click(await screen.findByRole("button", { name: "I have saved these codes" }));
    }
    await waitFor(() => expect(globalThis.__nextNavigationMock.router.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("offers profile retry without redirecting a verified session to login", async () => {
    browserState(true);
    providerMock.getSession.mockResolvedValue({ ...testSessions.admin, token: "" });
    providerMock.listUsers.mockRejectedValueOnce(new ApiError({ status: 500, detail: "Profile unavailable" })).mockResolvedValue(testUsers);
    render(<AuthProvider><RequireAuth><p>Dashboard content</p></RequireAuth></AuthProvider>);
    expect(await screen.findByText("Couldn’t load your profile")).toBeVisible();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
    expect(globalThis.__nextNavigationMock.router.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Dashboard content")).toBeVisible();
  });

  it("retries a temporarily unavailable session service without a login/dashboard redirect loop", async () => {
    browserState(true);
    browserState(true);
    providerMock.getSession.mockRejectedValueOnce(new ApiError({ status: 503 })).mockResolvedValue({ ...testSessions.admin, token: "" });
    render(<AuthProvider><RequireAuth><p>Recovered session content</p></RequireAuth></AuthProvider>);
    expect(await screen.findByText("Couldn’t verify your session")).toBeVisible();
    expect(globalThis.__nextNavigationMock.router.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Recovered session content")).toBeVisible();
  });

  it("keeps an MFA challenge out of browser storage", async () => {
    browserState();
    providerMock.login.mockResolvedValue({ requiresMfa: true, session: null, mfaToken: "pending", availableMethods: ["totp", "backup-code"] });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false"));
    await userEvent.click(screen.getByRole("button", { name: "Login admin" }));
    await waitFor(() => expect(screen.getByTestId("pending-mfa")).toHaveTextContent("pending"));
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("verifies MFA without passing the challenge token through JavaScript", async () => {
    browserState(false, true);
    providerMock.verifyMfa.mockResolvedValue({ ...testSessions.admin, token: "" });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("pending-mfa")).toHaveTextContent("pending"));
    await userEvent.click(screen.getByRole("button", { name: "Verify MFA" }));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    expect(providerMock.verifyMfa).toHaveBeenCalledWith({ method: "backup-code", code: "BKP-001-0001" });
  });

  it("clears a dead MFA marker", async () => {
    browserState(false, true);
    providerMock.verifyMfa.mockRejectedValue(new ApiError({ status: 401, detail: "Invalid or expired MFA token" }));
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("pending-mfa")).toHaveTextContent("pending"));
    await userEvent.click(screen.getByRole("button", { name: "Verify MFA" }));
    await waitFor(() => expect(screen.getByTestId("pending-mfa")).toHaveTextContent("none"));
  });

  it("logs out without exposing the session token", async () => {
    browserState(true, false);
    providerMock.getSession.mockResolvedValue({ ...testSessions.user, token: "" });
    providerMock.logout.mockResolvedValue(undefined);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("false"));
    expect(providerMock.logout).toHaveBeenCalledWith();
  });
});
