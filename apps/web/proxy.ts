import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getSessionUser } from './src/modules/identity-access/auth';
import { normalizeRole, resolveMinimumRole, roleOrder, type Role } from './src/modules/identity-access/access-policy';
import { REALM_ROUTE_PREFIXES, type Realm } from './lib/realms';

const ENABLE_NEXTAUTH_REALM_PARTITIONS = process.env.ENABLE_NEXTAUTH_REALM_PARTITIONS !== 'false';

const requiredRealmForPath = (pathname: string): Realm | null => {
  if (pathname === '/login' || pathname.startsWith('/api/auth')) return null;
  for (const realm of Object.keys(REALM_ROUTE_PREFIXES) as Realm[]) {
    const prefixes = REALM_ROUTE_PREFIXES[realm];
    if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return realm;
    }
  }
  return null;
};

const isPublicPath = (pathname: string) =>
  pathname === '/login' ||
  pathname.startsWith('/api/auth') ||
  pathname === '/health' ||
  pathname === '/compliance/transparency' ||
  pathname.startsWith('/compliance/transparency/') ||
  pathname.startsWith('/_next') ||
  pathname === '/favicon.ico' ||
  pathname === '/robots.txt';

const isApiRequest = (pathname: string) => pathname.startsWith('/api/');

type NextAuthTokenLike = {
  realm?: unknown;
  roles?: unknown;
  sub?: unknown;
  email?: unknown;
  preferred_username?: unknown;
};

const roleFromNextAuthToken = (token: NextAuthTokenLike | null): Role => {
  const rawRoles = Array.isArray(token?.roles)
    ? token.roles.filter((value): value is string => typeof value === 'string')
    : typeof token?.roles === 'string'
      ? [token.roles]
      : [];

  const normalized = normalizeRole(rawRoles);
  if (normalized !== 'READONLY') return normalized;

  const realm = typeof token?.realm === 'string' ? token.realm : '';
  if (realm === 'admins') return 'ADMIN';
  if (realm === 'employees') return 'OPERATOR';
  return 'READONLY';
};

const hasNextAuthIdentity = (token: NextAuthTokenLike | null): boolean => {
  if (!token) return false;
  return (
    typeof token.sub === 'string' ||
    typeof token.email === 'string' ||
    typeof token.preferred_username === 'string' ||
    typeof token.realm === 'string'
  );
};

const returnToForRequest = (req: NextRequest): string => {
  const pathWithQuery = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  return pathWithQuery.startsWith('/') ? pathWithQuery : '/';
};

const redirectToLogin = (req: NextRequest): NextResponse => {
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('returnTo', returnToForRequest(req));
  return NextResponse.redirect(loginUrl);
};

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)']
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const nextAuthToken = (await getToken({ req, secret: process.env.NEXTAUTH_SECRET }).catch(() => null)) as
    | NextAuthTokenLike
    | null;

  if (ENABLE_NEXTAUTH_REALM_PARTITIONS) {
    const requiredRealm = requiredRealmForPath(pathname);
    if (requiredRealm) {
      const realm = typeof nextAuthToken?.realm === 'string' ? nextAuthToken.realm : undefined;
      if (!nextAuthToken || !realm) {
        return redirectToLogin(req);
      }
      if (realm !== requiredRealm) {
        return redirectToLogin(req);
      }
      return NextResponse.next();
    }
  }

  const minimumRole = resolveMinimumRole(pathname, req.method);
  let session = await getSessionUser(req);
  if (!session.user && hasNextAuthIdentity(nextAuthToken)) {
    session = {
      user: {
        id: typeof nextAuthToken?.sub === 'string' ? nextAuthToken.sub : undefined,
        email: typeof nextAuthToken?.email === 'string' ? nextAuthToken.email : undefined,
        username: typeof nextAuthToken?.preferred_username === 'string' ? nextAuthToken.preferred_username : undefined,
        role: roleFromNextAuthToken(nextAuthToken)
      }
    };
  }

  if (!session.user) {
    if (isApiRequest(pathname)) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    return redirectToLogin(req);
  }

  if (minimumRole) {
    const role = normalizeRole(session.user.role ?? roleFromNextAuthToken(nextAuthToken));
    if (roleOrder[role] < roleOrder[minimumRole]) {
      if (isApiRequest(pathname)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      return NextResponse.rewrite(new URL('/403', req.url), { status: 403 });
    }
  }

  return NextResponse.next();
}
