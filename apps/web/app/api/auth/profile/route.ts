/**
 * /api/auth/profile — Get and update the authenticated user's profile.
 *
 * GET : returns profile data for the current session user
 * PATCH: updates display name, notifications, and other user-mutable fields
 *
 * Forwards session cookies to the upstream API for identity resolution.
 */

import { NextResponse, type NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  try {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `upstream ${res.status}` }, { status: res.status });
    }

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ...data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') ?? '';

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // Allow-list mutable fields — never proxy arbitrary keys to backend
  const { displayName, email, notifications, timezone } = body;
  const patch: Record<string, unknown> = {};
  if (displayName !== undefined) patch.displayName = String(displayName).slice(0, 100);
  if (email !== undefined) patch.email = String(email).slice(0, 254);
  if (notifications !== undefined) patch.notifications = notifications;
  if (timezone !== undefined) patch.timezone = String(timezone).slice(0, 64);

  try {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(6_000),
    });

    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'Auth service unavailable' }, { status: 503 });
  }
}
