import { redirect } from 'next/navigation';
import { auth } from '@/lib/nextauth';
import type { Realm } from '@/lib/realms';
import { fetchServerSession } from '@/src/modules/identity-access/serverSession';
import { normalizeRole, type Role } from '@/src/modules/identity-access/access-policy';

const ENABLE_LEGACY_SESSION_FALLBACK = process.env.ENABLE_LEGACY_SESSION_FALLBACK === 'true';

const roleToRealm: Record<Role, Realm> = {
  READONLY: 'users',
  OPERATOR: 'employees',
  ADMIN: 'admins',
  OWNER: 'admins'
};

const realmFromLegacyRole = (role?: string | string[] | null): Realm => roleToRealm[normalizeRole(role)];

export async function requireRealm(required: Realm) {
  const nextAuthSession = await auth().catch(() => null);
  const nextAuthRealm = (nextAuthSession as { realm?: Realm } | null)?.realm;
  if (nextAuthSession && nextAuthRealm) {
    if (nextAuthRealm !== required) redirect('/login');
    return;
  }

  // Compatibility path for legacy server-session auth (opt-in only).
  if (!ENABLE_LEGACY_SESSION_FALLBACK) {
    redirect('/login');
  }
  const legacySession = await fetchServerSession();
  if (!legacySession.user) redirect('/login');
  if (realmFromLegacyRole(legacySession.user.role) !== required) redirect('/login');
}

export async function requireRole(role: string) {
  const nextAuthSession = (await auth().catch(() => null)) as { roles?: string[] } | null;
  if (nextAuthSession?.roles) {
    if (!nextAuthSession.roles.includes(role)) redirect('/login');
    return;
  }

  if (!ENABLE_LEGACY_SESSION_FALLBACK) {
    redirect('/login');
  }
  const legacySession = await fetchServerSession();
  if (!legacySession.user) redirect('/login');
  const normalized = normalizeRole(legacySession.user.role);
  if (role === 'admin' && normalized !== 'ADMIN' && normalized !== 'OWNER') {
    redirect('/login');
  }
}
