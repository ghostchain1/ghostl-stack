/**
 * /api/portal/users — Proxy to auth-service for user management data.
 *
 * GET: Returns paginated user list with realm + role information.
 * Requires ADMIN role (enforced by access-policy middleware).
 */

import { type NextRequest, NextResponse } from 'next/server';

const AUTH_URL = process.env.AUTH_SERVICE_INTERNAL_URL ?? process.env.AUTH_SERVICE_URL ?? 'http://localhost:3100';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const realm  = searchParams.get('realm') ?? undefined;
  const limit  = Math.min(Number(searchParams.get('limit') ?? 100), 500);
  const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0);

  const url = new URL('/api/admin/users', AUTH_URL);
  if (realm) url.searchParams.set('realm', realm);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  try {
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json({ users: [], total: 0 }, { status: 200 });
    }

    const data: unknown = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ users: [], total: 0 }, { status: 200 });
  }
}
