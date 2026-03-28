import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi } from "../../api/authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const result = await authApi.me();
        if (!cancelled) {
          setUser(result.user);
          setSession(result.session);
        }
      } catch (_error) {
        if (!cancelled) {
          setUser(null);
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: Boolean(user),
      setAuth(nextUser, nextSession) {
        setUser(nextUser);
        setSession(nextSession ?? null);
      },
      clearAuth() {
        setUser(null);
        setSession(null);
      },
    }),
    [isLoading, session, user],
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
