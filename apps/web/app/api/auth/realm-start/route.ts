import { NextResponse } from 'next/server';
import { signIn } from '@/lib/nextauth';
import { REALM_DEFAULT_PATH, isRealm } from '@/lib/realms';
import { realmFromCookieHeader } from '@/lib/auth/options';

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
  const requestUrl = new URL(req.url);
  const origin = resolvePublicOrigin(req, requestUrl);
  const realm = realmFromCookieHeader(req.headers.get('cookie'));
  const callbackUrl = safeReturnPath(requestUrl.searchParams.get('callbackUrl')) || REALM_DEFAULT_PATH[realm];

  if (!isRealm(realm)) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  try {
    const signinLocation = await signIn('keycloak', { redirect: false, redirectTo: callbackUrl });
    if (typeof signinLocation !== 'string' || signinLocation.length === 0) {
      return NextResponse.redirect(new URL('/login', origin));
    }
    return NextResponse.redirect(signinLocation);
  } catch {
    return NextResponse.redirect(new URL('/login?error=signin_failed', origin));
  }
}
