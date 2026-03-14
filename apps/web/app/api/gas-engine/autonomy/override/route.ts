import { NextRequest } from 'next/server';
import { ensureAdminSession, proxyGasEngineAdmin } from '../../../../../src/lib/gas-engine-admin';

export async function POST(req: NextRequest) {
  const guard = await ensureAdminSession(req);
  if (guard) return guard;
  const payload = await req.json().catch(() => ({}));
  return proxyGasEngineAdmin('/v1/autonomy/override', payload);
}
