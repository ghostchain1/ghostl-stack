'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveApiBase } from '../../lib/runtime';
import { normalizeRole, type Role } from './access-policy';

export type SessionUser = { id?: string; email?: string; username?: string; wallets?: string[]; role?: Role };
export type SessionState = {
  user?: SessionUser;
  loading: boolean;
};

const SessionContext = createContext<SessionState>({ loading: true });

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: SessionState }) {
  const [state, setState] = useState<SessionState>(initial || { loading: true });

  useEffect(() => {
    if (initial?.user) return;
    const load = async () => {
      try {
        const res = await fetch(`${resolveApiBase()}/api/auth/me`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
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
              role: normalizeRole(rawUser.role ?? data.role)
            },
            loading: false
          });
          return;
        }
      } catch {
        // ignore
      }
      setState({ loading: false });
    };
    load();
  }, [initial]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
