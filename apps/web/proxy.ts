import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from './src/modules/identity-access/auth';
import { normalizeRole, resolveMinimumRole, roleOrder } from './src/modules/identity-access/access-policy';

const isPublicPath = (pathname: string) =>
  pathname === '/login' ||
  pathname.startsWith('/api/auth') ||
  pathname === '/health' ||
  pathname.startsWith('/_next') ||
  pathname === '/favicon.ico' ||
  pathname === '/robots.txt';

const isApiRequest = (pathname: string) => pathname.startsWith('/api/');

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)']
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const minimumRole = resolveMinimumRole(pathname, req.method);
  const session = await getSessionUser(req);

  if (!session.user) {
    if (isApiRequest(pathname)) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (minimumRole) {
    const role = normalizeRole(session.user?.role);
    if (roleOrder[role] < roleOrder[minimumRole]) {
      if (isApiRequest(pathname)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}
