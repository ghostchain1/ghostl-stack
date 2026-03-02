import { NextRequest, NextResponse } from 'next/server';

export type Alert = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  summary: string;
  ts: string;
  ack: boolean;
  source: string;
};

const ALERTS: Alert[] = [
  { id: 'ALT-0041', severity: 'critical', title: 'Bridge relay latency spike',        summary: 'Cross-chain relay latency exceeded 3× baseline for 8 min. Deposits unaffected but confirmation times elevated.', ts: '2026-03-01T14:22:00Z', ack: false, source: 'l2-bridge-relay' },
  { id: 'ALT-0040', severity: 'warning',  title: 'Wallet nonce gap detected',         summary: 'Nonce gap on 0x1F3a…B7C9 may delay pending transactions. Reset nonce in wallet settings if stuck.', ts: '2026-03-01T11:04:00Z', ack: false, source: 'l3-sequencer' },
  { id: 'ALT-0039', severity: 'info',     title: 'New governance vote opened',        summary: 'GIP-0017: L2 fee parameter adjustment. Voting closes Mar 5 2026 at 18:00 UTC.', ts: '2026-02-28T18:30:00Z', ack: true, source: 'governance' },
  { id: 'ALT-0038', severity: 'info',     title: 'Treasury yield disbursed',          summary: '0.00042 GST credited to staking escrow from quarterly yield distribution.', ts: '2026-02-28T06:00:00Z', ack: true, source: 'treasury-ai' },
  { id: 'ALT-0037', severity: 'warning',  title: 'Validator commission change',       summary: 'Validator 0xB841…E2D3 increased commission from 5% to 7%. Re-delegate if desired.', ts: '2026-02-27T22:15:00Z', ack: true, source: 'l1-consensus' },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const severity = searchParams.get('severity');
  const ack      = searchParams.get('ack');

  let data = ALERTS;
  if (severity) data = data.filter(a => a.severity === severity);
  if (ack === 'false') data = data.filter(a => !a.ack);
  if (ack === 'true')  data = data.filter(a => a.ack);

  return NextResponse.json({ alerts: data, total: data.length });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // In production: update DB record. Here we echo success.
  return NextResponse.json({ ok: true, id, ack: true });
}
