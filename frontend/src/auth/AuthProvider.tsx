import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";
import { getAuthSession, login, logout, signUp, type AuthSession } from "./authApi";

type AuthContextValue = {
  session: AuthSession;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (
    username: string,
    email: string,
    password: string,
    confirmPassword: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<AuthSession>;
  revalidateSession: () => Promise<boolean>;
  authenticatedFetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ANONYMOUS_SESSION: AuthSession = {
  authenticated: false,
  userId: null,
  username: null,
  email: null,
  role: null,
  allowedRoomId: null,
  displayName: null,
  clientId: null
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(ANONYMOUS_SESSION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getAuthSession()
      .then((nextSession) => {
        if (!cancelled) {
          setSession(nextSession);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSession = useCallback(async () => {
    const nextSession = await getAuthSession();
    setSession(nextSession);
    return nextSession;
  }, []);

  const revalidateSession = useCallback(async () => (
    await refreshSession()
  ).authenticated, [refreshSession]);

  const authenticatedFetch = useCallback(async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ) => {
    const response = await fetch(input, {
      ...init,
      credentials: "include"
    });

    if (response.status === 401) {
      try {
        setSession(await getAuthSession());
      } catch {
        setSession(ANONYMOUS_SESSION);
      }
    }

    return response;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    signIn: async (identifier, password) => {
      setSession(await login(identifier, password));
    },
    signUp: async (username, email, password, confirmPassword) => {
      setSession(await signUp(username, email, password, confirmPassword));
    },
    signOut: async () => {
      setSession(await logout());
    },
    refreshSession,
    revalidateSession,
    authenticatedFetch
  }), [authenticatedFetch, loading, refreshSession, revalidateSession, session]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}

