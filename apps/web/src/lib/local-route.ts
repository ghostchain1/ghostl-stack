/**
 * localRoute — fetch a Next.js API route from within an async Server Component.
 *
 * Uses the incoming `host` header to build an absolute URL so it works in
 * both dev (localhost:3200) and production (e.g. app.ghostchain.cloud).
 */
import { headers } from 'next/headers';

export async function localRoute<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const hdrs = await headers();
    const host  = hdrs.get('host') ?? 'localhost:3200';
    const proto = host.startsWith('localhost') ? 'http' : 'https';
    const res   = await fetch(`${proto}://${host}${path}`, {
      cache: 'no-store',
      ...init,
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}
