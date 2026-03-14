import { NextResponse } from 'next/server';
import { REALM_DEFAULT_PATH, isRealm } from '@/lib/realms';

const safeReturnPath = (value: string | null): string | null => {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  return value;
};

const resolvePublicOrigin = (req: Request, fallback: URL): string => {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto');
  if (host && proto) {
    return `${proto}://${host}`;
  }
  return fallback.origin;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = resolvePublicOrigin(req, url);
  const requestedRealm = url.searchParams.get('realm') ?? 'users';

  if (!isRealm(requestedRealm)) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const returnTo = safeReturnPath(url.searchParams.get('returnTo')) || REALM_DEFAULT_PATH[requestedRealm];
  const realmStartUrl = new URL('/api/auth/realm-start', origin);
  realmStartUrl.searchParams.set('callbackUrl', returnTo);

  const res = NextResponse.redirect(realmStartUrl);
  res.cookies.set('ghost_realm', requestedRealm, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60
  });
  return res;
}
