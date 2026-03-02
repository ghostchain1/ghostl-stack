import { NextResponse } from 'next/server';
import { signOut } from '@/lib/nextauth';

/**
 * GET/POST /api/auth/logout
 * Signs the user out of NextAuth and optionally revokes the API session.
 * Redirects to /login after signing out.
 */
export async function GET(req: Request) {
  return handleLogout(req);
}

export async function POST(req: Request) {
  return handleLogout(req);
}

async function handleLogout(req: Request) {
  const requestUrl = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const origin = host ? `${proto}://${host}` : requestUrl.origin;

  try {
    // signOut in server context — redirect: false returns the redirect URL
    await signOut({ redirect: false });
  } catch {
    // Ignore — token may already be invalid
  }

  return NextResponse.redirect(new URL('/login', origin));
}
