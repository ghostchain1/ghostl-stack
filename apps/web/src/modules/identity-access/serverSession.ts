import { cookies } from 'next/headers';
import type { SessionUser } from './session';
import { normalizeRole } from './access-policy';

const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function fetchServerSession(): Promise<{ user?: SessionUser }> {
  try {
    const cookieHeader = (await cookies()).toString();
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
}
