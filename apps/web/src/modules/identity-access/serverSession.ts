import { cookies } from 'next/headers';
import type { SessionUser } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function fetchServerSession(): Promise<{ user?: SessionUser; roles?: string[]; permissions?: string[] }> {
  try {
    const cookieHeader = cookies().toString();
    const res = await fetch(`${API_URL}/auth/session`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store'
    });
    if (!res.ok) return {};
    const data = await res.json();
    return { user: data.user, roles: data.roles, permissions: data.permissions };
  } catch {
    return {};
  }
}
