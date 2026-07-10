'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getApiClient, type AuthUser } from './api-client';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const api = getApiClient();
    const current = await api.auth.me();
    setUser(current);
    return current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getApiClient();
      const current = await api.auth.me();
      if (!cancelled) {
        setUser(current);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    const api = getApiClient();
    await api.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
