import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, requireRole } from '../modules/identity-access/auth';

const GAS_ENGINE_URL =
  process.env.AI_CORE_URL ||
  process.env.NEXT_PUBLIC_AI_CORE_URL ||
  process.env.GAS_ENGINE_URL ||
  process.env.NEXT_PUBLIC_GAS_ENGINE_URL ||
  'http://ghost-gas-engine:3210';
const ADMIN_TOKEN = process.env.GAS_ENGINE_ADMIN_TOKEN;

export const ensureAdminSession = async (req: NextRequest): Promise<NextResponse | null> => {
  const session = await getSessionUser(req);
  if (!session.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  try {
    requireRole(session.user?.role, 'ADMIN');
  } catch {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
};

export const proxyGasEngineAdmin = async (path: string, body: unknown) => {
  if (!ADMIN_TOKEN) {
    return NextResponse.json(
      { error: 'admin_token_missing', hint: 'Set GAS_ENGINE_ADMIN_TOKEN to enable admin actions.' },
      { status: 503 }
    );
  }
  const res = await fetch(`${GAS_ENGINE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': ADMIN_TOKEN
    },
    body: JSON.stringify(body ?? {})
  });
  const payload = await res.json().catch(() => ({}));
  return NextResponse.json(payload, { status: res.status });
};
