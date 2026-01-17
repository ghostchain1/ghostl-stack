'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveApiBase } from '../../lib/runtime';

export type SessionUser = { id?: string; email?: string; roles?: string[]; permissions?: string[] };
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
        const res = await fetch(`${resolveApiBase()}/auth/session`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setState({
            user: { id: data.user?.id, email: data.user?.email, roles: data.roles, permissions: data.permissions },
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
