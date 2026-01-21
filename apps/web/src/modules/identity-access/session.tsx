'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveApiBase } from '../../lib/runtime';
import { normalizeRole, type Role } from './access-policy';
import { apiRequest, type ApiError } from '../../lib/api';

export type SessionUser = { id?: string; email?: string; username?: string; wallets?: string[]; role?: Role };
export type SessionState = {
  user?: SessionUser;
  loading: boolean;
  error?: ApiError;
};

const SessionContext = createContext<SessionState>({ loading: true });

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: SessionState }) {
  const [state, setState] = useState<SessionState>(initial || { loading: true });

  useEffect(() => {
    if (initial?.user) return;
    const load = async () => {
      try {
        const res = await apiRequest<{ user?: SessionUser; role?: Role }>('/api/auth/me', { baseUrl: resolveApiBase() });
        if (!res.ok) {
          setState({ loading: false, error: res.error });
          return;
        }
        const data = res.data;
        const rawUser = data?.user ?? data;
        if (!rawUser?.id) {
          setState({ loading: false });
          return;
        }
        setState({
          user: {
            id: rawUser.id,
            email: rawUser.email,
            username: rawUser.username,
            wallets: rawUser.wallets,
            role: normalizeRole((rawUser as SessionUser).role ?? (data as { role?: Role }).role)
          },
          loading: false
        });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'session_fetch_failed';
        setState({
          loading: false,
          error: {
            message,
            endpoint: `${resolveApiBase()}/api/auth/me`,
            method: 'GET'
          }
        });
        return;
      }
      setState({ loading: false });
    };
    load();
  }, [initial]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
