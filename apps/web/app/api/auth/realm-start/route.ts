import { NextResponse } from 'next/server';
import { isRealm } from '@/lib/realms';
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
  if (host && proto) return `${proto}://${host}`;
  return fallback.origin;
};

const isKeycloakConfigured = () =>
  Boolean(process.env.KEYCLOAK_CLIENT_ID && process.env.KEYCLOAK_CLIENT_SECRET && process.env.KEYCLOAK_BASE_URL);

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = resolvePublicOrigin(req, requestUrl);
  const realm = realmFromCookieHeader(req.headers.get('cookie'));

  if (!isRealm(realm)) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  // If Keycloak is configured, attempt SSO redirect
  if (isKeycloakConfigured()) {
    try {
      const { signIn } = await import('@/lib/nextauth');
      const callbackUrl =
        safeReturnPath(requestUrl.searchParams.get('callbackUrl')) ??
        (realm === 'admins' ? '/governance' : realm === 'employees' ? '/incidents' : '/dashboard');
      const signinLocation = await signIn('keycloak', { redirect: false, redirectTo: callbackUrl });
      if (typeof signinLocation === 'string' && signinLocation.length > 0) {
        return NextResponse.redirect(signinLocation);
      }
    } catch {
      // fall through to credentials login
    }
  }

  // No Keycloak → send to the credentials login form
  const params = new URLSearchParams();
  const callbackPath = safeReturnPath(requestUrl.searchParams.get('callbackUrl'));
  if (callbackPath) params.set('callbackUrl', callbackPath);
  return NextResponse.redirect(new URL(`/login?${params.toString()}`, origin));
}
