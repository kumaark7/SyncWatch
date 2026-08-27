import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getAuthSession, login, logout, type AuthSession } from "./authApi";

type AuthContextValue = {
  session: AuthSession;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>({
    authenticated: false,
    username: null
  });
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

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    signIn: async (username, password) => {
      setSession(await login(username, password));
    },
    signOut: async () => {
      setSession(await logout());
    }
  }), [session, loading]);

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

