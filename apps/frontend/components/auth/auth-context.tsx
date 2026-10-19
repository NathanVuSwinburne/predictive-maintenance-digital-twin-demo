"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useDataProvider } from "@/hooks/use-data-provider";
import { clearSessionMetaCookie, writeSessionMetaToDocument } from "@/lib/auth/session-cookie-state";
import { ApiError } from "@/lib/data/fastapi-provider";
import type { ActivationResult, LoginInput, LoginResult, MfaMethod, Session, UserPersona } from "@/lib/domain/types";
import type { UserFacingError } from "@/lib/errors/user-facing-error";

type AuthContextValue = {
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  session: Session | null;
  users: UserPersona[];
  activePersona: UserPersona | null;
  pendingMfaToken: string | null;
  pendingMfaMethods: MfaMethod[];
  profileError: UserFacingError | null;
  activateInvitation(input: { token: string; password: string; totpCode?: string }): Promise<ActivationResult>;
  refreshUsers(): Promise<UserPersona[]>;
  retryProfile(): Promise<void>;
  login(input: LoginInput): Promise<LoginResult>;
  verifyMfa(input: { method: MfaMethod; code: string }): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const provider = useDataProvider();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [users, setUsers] = useState<UserPersona[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [pendingMfaToken, setPendingMfaToken] = useState<string | null>(null);
  const [pendingMfaMethods, setPendingMfaMethods] = useState<MfaMethod[]>([]);
  const [profileError, setProfileError] = useState<UserFacingError | null>(null);

  const refreshUsers = useCallback(async () => {
    try {
      const loaded = await provider.listUsers();
      setUsers(loaded);
      setProfileError(null);
      return loaded;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Rechecking through the BFF clears an invalid HttpOnly cookie as well.
        try {
          if (await provider.getSession() === null) {
            setSession(null);
            setUsers([]);
            setProfileError(null);
            clearSessionMetaCookie();
            return [];
          }
        } catch {
          // Keep the retry path if session validation itself is unavailable.
        }
      }
      // A profile-service failure is not evidence that the session is invalid.
      setProfileError({ title: "Couldn’t load your profile", message: "Try again to open the application." });
      return [];
    }
  }, [provider]);

  const restoreSession = useCallback(async (isActive: () => boolean) => {
    setIsBootstrapping(true);
    try {
      const stateResponse = await fetch("/api/session-state", { cache: "no-store" });
      if (!stateResponse.ok) throw new Error("Session state unavailable");
      const state = (await stateResponse.json()) as { hasSession: boolean; hasPendingMfa: boolean };
      if (!isActive()) return;
      setProfileError(null);
      if (state.hasPendingMfa) {
        // Non-secret marker only; the real challenge remains in an HttpOnly cookie.
        setPendingMfaToken("pending");
        setPendingMfaMethods(["totp", "backup-code"]);
      }
      if (!state.hasSession) {
        setSession(null);
        setUsers([]);
        clearSessionMetaCookie();
        return;
      }
      const validSession = await provider.getSession();
      if (!isActive()) return;
      if (!validSession) {
        setSession(null);
        setUsers([]);
        clearSessionMetaCookie();
        return;
      }
      setSession(validSession);
      writeSessionMetaToDocument(validSession);
      await refreshUsers();
    } catch {
      if (isActive()) {
        setProfileError({ title: "Couldn’t verify your session", message: "Try again when the application is available." });
      }
    } finally {
      if (isActive()) setIsBootstrapping(false);
    }
  }, [provider, refreshUsers]);

  useEffect(() => {
    let active = true;
    void restoreSession(() => active);
    return () => { active = false; };
  }, [restoreSession]);

  const retryProfile = useCallback(async () => {
    if (session) await refreshUsers();
    else await restoreSession(() => true);
  }, [session, refreshUsers, restoreSession]);

  const activateInvitation = useCallback(async (input: { token: string; password: string; totpCode?: string }) => {
    const result = await provider.activateInvitation(input);
    setSession(result.session);
    setPendingMfaToken(null);
    setPendingMfaMethods([]);
    writeSessionMetaToDocument(result.session);
    await refreshUsers();
    return result;
  }, [provider, refreshUsers]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await provider.login(input);
    if (result.requiresMfa) {
      setSession(null);
      setUsers([]);
      setPendingMfaToken("pending");
      setPendingMfaMethods(result.availableMethods);
      return result;
    }
    setSession(result.session);
    setPendingMfaToken(null);
    setPendingMfaMethods([]);
    clearSessionMetaCookie();
    writeSessionMetaToDocument(result.session);
    await refreshUsers();
    return result;
  }, [provider, refreshUsers]);

  const verifyMfa = useCallback(async (input: { method: MfaMethod; code: string }) => {
    if (!pendingMfaToken) throw new Error("MFA session is not available");
    try {
      const nextSession = await provider.verifyMfa(input);
      setSession(nextSession);
      setPendingMfaToken(null);
      setPendingMfaMethods([]);
      writeSessionMetaToDocument(nextSession);
      await refreshUsers();
    } catch (error) {
      if (error instanceof ApiError && typeof error.detail === "string" && error.detail.includes("Invalid or expired MFA token")) {
        setSession(null);
        setUsers([]);
        setPendingMfaToken(null);
        setPendingMfaMethods([]);
      }
      throw error;
    }
  }, [pendingMfaToken, provider, refreshUsers]);

  const logout = useCallback(async () => {
    if (session) await provider.logout();
    setSession(null);
    setUsers([]);
    setPendingMfaToken(null);
    setPendingMfaMethods([]);
    setProfileError(null);
    clearSessionMetaCookie();
  }, [provider, session]);

  const activePersona = useMemo(() => session
    ? users.find((user) => user.id === session.activePersonaId) ?? users.find((user) => user.id === session.userId) ?? null
    : null, [session, users]);

  const value = useMemo<AuthContextValue>(() => ({
    isBootstrapping,
    isAuthenticated: Boolean(session),
    session,
    users,
    activePersona,
    pendingMfaToken,
    pendingMfaMethods,
    profileError,
    activateInvitation,
    refreshUsers,
    retryProfile,
    login,
    verifyMfa,
    logout,
  }), [activePersona, activateInvitation, isBootstrapping, login, logout, pendingMfaMethods, pendingMfaToken, profileError, refreshUsers, retryProfile, session, users, verifyMfa]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
