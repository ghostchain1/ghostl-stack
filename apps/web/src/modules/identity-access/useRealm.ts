'use client';

import { roleToRealm } from '@ghostl/auth';
import type { Realm } from '@ghostl/auth';
import { normalizeRole } from './access-policy';
import { useSession } from './session';

/**
 * Returns the realm that matches the current user's role, or null
 * while the session is still loading or the user is not authenticated.
 */
export function useRealm(): Realm | null {
  const { user, loading } = useSession();
  if (loading || !user?.role) return null;
  return roleToRealm[normalizeRole(user.role)];
}
