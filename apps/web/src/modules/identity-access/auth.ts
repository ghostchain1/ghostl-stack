import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { normalizeRole, roleOrder, type Role } from './access-policy';

export type SessionUser = { id?: string; email?: string; roles?: string[] };

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const getSessionUser = async (req?: NextRequest): Promise<{ user?: SessionUser; roles?: string[] }> => {
  try {
    const cookieHeader = req?.headers.get('cookie') || (await cookies()).toString();
    const res = await fetch(`${API_URL}/auth/session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store'
    });
    if (!res.ok) return {};
    const data = await res.json();
    return { user: data.user, roles: data.roles };
  } catch {
    return {};
  }
};

export const requireAuth = async (req?: NextRequest) => {
  const session = await getSessionUser(req);
  if (!session.user) throw new Error('unauthenticated');
  return session;
};

export const requireRole = (roles: string[] | undefined, minimumRole: Role) => {
  const userRole = normalizeRole(roles);
  if (roleOrder[userRole] < roleOrder[minimumRole]) {
    throw new Error('forbidden');
  }
};

export const withAuth =
  <T>(handler: (req: NextRequest, user: SessionUser) => Promise<T>, minimumRole: Role) =>
  async (req: NextRequest) => {
    const session = await requireAuth(req);
    requireRole(session.roles, minimumRole);
    return handler(req, session.user!);
  };
