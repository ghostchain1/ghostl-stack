import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { normalizeRole, roleOrder, type Role } from './access-policy';
import { resolveApiBase } from '../../lib/runtime';

export type SessionUser = { id?: string; email?: string; username?: string; wallets?: string[]; role?: Role };

const API_URL = resolveApiBase();

export const getSessionUser = async (req?: NextRequest): Promise<{ user?: SessionUser }> => {
  try {
    const cookieHeader = req?.headers.get('cookie') || (await cookies()).toString();
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store'
    });
    if (!res.ok) return {};
    const data = await res.json();
    const rawUser = data?.user ?? data;
    if (!rawUser?.id) return {};
    return {
      user: {
        id: rawUser.id,
        email: rawUser.email,
        username: rawUser.username,
        wallets: rawUser.wallets,
        role: normalizeRole(rawUser.role ?? data.role)
      }
    };
  } catch {
    return {};
  }
};

export const requireAuth = async (req?: NextRequest) => {
  const session = await getSessionUser(req);
  if (!session.user) throw new Error('unauthenticated');
  return session;
};

export const requireRole = (role: string | undefined, minimumRole: Role) => {
  const userRole = normalizeRole(role);
  if (roleOrder[userRole] < roleOrder[minimumRole]) {
    throw new Error('forbidden');
  }
};

export const withAuth =
  <T>(handler: (req: NextRequest, user: SessionUser) => Promise<T>, minimumRole: Role) =>
  async (req: NextRequest) => {
    const session = await requireAuth(req);
    requireRole(session.user?.role, minimumRole);
    return handler(req, session.user!);
  };
