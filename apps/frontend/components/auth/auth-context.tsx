"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  LoginInput,
  LoginResult,
  MfaMethod,
  Session,
  UserPersona,
} from "@/lib/domain/types";
import { useDataProvider } from "@/hooks/use-data-provider";
import {
  AUTH_STORAGE_KEY,
  MFA_PENDING_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import {
  clearSessionMetaCookie,
  writeSessionMetaToDocument,
} from "@/lib/auth/session-cookie-state";

type AuthContextValue = {
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  session: Session | null;
  users: UserPersona[];
  activePersona: UserPersona | null;
  pendingMfaToken: string | null;
  pendingMfaMethods: MfaMethod[];
  refreshUsers(): Promise<UserPersona[]>;
  login(input: LoginInput): Promise<LoginResult>;
  verifyMfa(input: {
    method: MfaMethod;
    code: string;
  }): Promise<void>;
  logout(): Promise<void>;
};

type PersistedAuth = {
  session: Session | null;
  pendingMfaToken: string | null;
  pendingMfaMethods?: MfaMethod[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

function persistAuth(state: PersistedAuth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

function readPersistedAuth(): PersistedAuth {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!stored) {
    return {
      session: null,
      pendingMfaToken: null,
      pendingMfaMethods: [],
    };
  }

  try {
    const parsed = JSON.parse(stored) as PersistedAuth;
    return {
      session: parsed.session,
      pendingMfaToken: parsed.pendingMfaToken,
      pendingMfaMethods: parsed.pendingMfaMethods ?? [],
    };
  } catch {
    return {
      session: null,
      pendingMfaToken: null,
      pendingMfaMethods: [],
    };
  }
}

function setCookie(name: string, value: string, maxAgeSeconds = 86_400) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function clearPendingMfaState() {
  clearCookie(MFA_PENDING_COOKIE_NAME);
  persistAuth({
    session: null,
    pendingMfaToken: null,
    pendingMfaMethods: [],
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const provider = useDataProvider();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [users, setUsers] = useState<UserPersona[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [pendingMfaToken, setPendingMfaToken] = useState<string | null>(null);
  const [pendingMfaMethods, setPendingMfaMethods] = useState<MfaMethod[]>([]);

  const refreshUsers = useCallback(async () => {
    const loadedUsers = await provider.listUsers();
    setUsers(loadedUsers);
    return loadedUsers;
  }, [provider]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const persisted = readPersistedAuth();

        if (persisted.pendingMfaToken) {
          setPendingMfaToken(persisted.pendingMfaToken);
          setPendingMfaMethods(
            persisted.pendingMfaMethods?.length
              ? persisted.pendingMfaMethods
              : ["totp", "backup-code"],
          );
          setCookie(MFA_PENDING_COOKIE_NAME, persisted.pendingMfaToken);
        }

        if (!persisted.session) {
          setUsers([]);
          setSession(null);
          clearCookie(SESSION_COOKIE_NAME);
          clearSessionMetaCookie();
          return;
        }

        const validSession = await provider.getSession(persisted.session.token);

        if (!active) {
          return;
        }

        if (!validSession) {
          setSession(null);
          clearCookie(SESSION_COOKIE_NAME);
          clearSessionMetaCookie();
          persistAuth({
            session: null,
            pendingMfaToken: persisted.pendingMfaToken,
            pendingMfaMethods: persisted.pendingMfaMethods,
          });
          return;
        }

        setSession(validSession);
        setCookie(SESSION_COOKIE_NAME, validSession.token);
        writeSessionMetaToDocument(validSession);

        const loadedUsers = await provider.listUsers();

        if (!active) {
          return;
        }

        setUsers(loadedUsers);
      } catch {
        if (active) {
          setUsers([]);
          setSession(null);
          clearSessionMetaCookie();
        }
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [provider]);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await provider.login(input);
      if (result.requiresMfa) {
        setSession(null);
        setUsers([]);
        setPendingMfaToken(result.mfaToken);
        setPendingMfaMethods(result.availableMethods);
        clearCookie(SESSION_COOKIE_NAME);
        clearSessionMetaCookie();
        setCookie(MFA_PENDING_COOKIE_NAME, result.mfaToken, 900);
        persistAuth({
          session: null,
          pendingMfaToken: result.mfaToken,
          pendingMfaMethods: result.availableMethods,
        });
        return result;
      }

      setSession(result.session);
      setPendingMfaToken(null);
      setPendingMfaMethods([]);
      setCookie(SESSION_COOKIE_NAME, result.session.token);
      writeSessionMetaToDocument(result.session);
      clearCookie(MFA_PENDING_COOKIE_NAME);
      const loadedUsers = await provider.listUsers();
      setUsers(loadedUsers);
      persistAuth({
        session: result.session,
        pendingMfaToken: null,
        pendingMfaMethods: [],
      });
      return result;
    },
    [provider],
  );

  const verifyMfa = useCallback(
    async (input: { method: MfaMethod; code: string }) => {
      if (!pendingMfaToken) {
        throw new Error("MFA session is not available");
      }

      try {
        const nextSession = await provider.verifyMfa({
          ...input,
          mfaToken: pendingMfaToken,
        });

        setSession(nextSession);
        setPendingMfaToken(null);
        setPendingMfaMethods([]);
        setCookie(SESSION_COOKIE_NAME, nextSession.token);
        writeSessionMetaToDocument(nextSession);
        const loadedUsers = await provider.listUsers();
        setUsers(loadedUsers);
        clearPendingMfaState();
        persistAuth({
          session: nextSession,
          pendingMfaToken: null,
          pendingMfaMethods: [],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("Invalid or expired MFA token")) {
          setSession(null);
          setUsers([]);
          setPendingMfaToken(null);
          setPendingMfaMethods([]);
          clearSessionMetaCookie();
          clearPendingMfaState();
        }
        throw error;
      }
    },
    [pendingMfaToken, provider],
  );

  const logout = useCallback(async () => {
    if (session) {
      await provider.logout(session.token);
    }

    setSession(null);
    setUsers([]);
    setPendingMfaToken(null);
    setPendingMfaMethods([]);
    clearCookie(SESSION_COOKIE_NAME);
    clearCookie(MFA_PENDING_COOKIE_NAME);
    clearSessionMetaCookie();
    persistAuth({ session: null, pendingMfaToken: null, pendingMfaMethods: [] });
  }, [provider, session]);

  const activePersona = useMemo(() => {
    if (!session) {
      return null;
    }

    // activePersonaId is a persona id, while current UserPersona.id is account id.
    // Keep a userId fallback so active identity still resolves with current API shape.
    return (
      users.find((user) => user.id === session.activePersonaId) ??
      users.find((user) => user.id === session.userId) ??
      null
    );
  }, [session, users]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isBootstrapping,
      isAuthenticated: Boolean(session),
      session,
      users,
      activePersona,
      pendingMfaToken,
      pendingMfaMethods,
      refreshUsers,
      login,
      verifyMfa,
      logout,
    }),
    [
      activePersona,
      isBootstrapping,
      login,
      logout,
      pendingMfaToken,
      pendingMfaMethods,
      refreshUsers,
      session,
      users,
      verifyMfa,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
