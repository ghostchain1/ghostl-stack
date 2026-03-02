import { NextRequest, NextResponse } from 'next/server';

export type Ticket = {
  id: string;
  user: string;
  subject: string;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  created: string;
  updated: string;
  assigned: string | null;
};

const TICKETS: Ticket[] = [
  { id: 'TKT-0821', user: '0x4a2F…C3D1', subject: 'Bridge deposit stuck for 3 hours',   priority: 'high',   status: 'open',        created: '2026-03-01T13:40:00Z', updated: '2026-03-01T13:40:00Z', assigned: null          },
  { id: 'TKT-0820', user: '0xB3e9…A112', subject: 'Cannot connect MetaMask to L3 RPC',  priority: 'medium', status: 'in-progress', created: '2026-03-01T11:05:00Z', updated: '2026-03-01T14:00:00Z', assigned: 'ops-agent-2' },
  { id: 'TKT-0819', user: '0x7cD4…F298', subject: 'KYC rejected — ID mismatch',         priority: 'high',   status: 'in-progress', created: '2026-03-01T09:22:00Z', updated: '2026-03-01T10:30:00Z', assigned: 'kyc-agent-1' },
  { id: 'TKT-0818', user: '0xA1b2…3C4D', subject: 'Staking rewards not showing',        priority: 'low',    status: 'resolved',    created: '2026-02-28T17:00:00Z', updated: '2026-02-28T18:45:00Z', assigned: 'ops-agent-1' },
  { id: 'TKT-0817', user: '0x9E8f…1B2C', subject: 'API key 403 on /v1/wallet',          priority: 'medium', status: 'resolved',    created: '2026-02-28T14:30:00Z', updated: '2026-02-28T16:00:00Z', assigned: 'dev-agent-3' },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status   = searchParams.get('status');
  const priority = searchParams.get('priority');

  let data = TICKETS;
  if (status)   data = data.filter(t => t.status === status);
  if (priority) data = data.filter(t => t.priority === priority);

  return NextResponse.json({
    tickets: data,
    total: data.length,
    stats: {
      open:        TICKETS.filter(t => t.status === 'open').length,
      in_progress: TICKETS.filter(t => t.status === 'in-progress').length,
      resolved:    TICKETS.filter(t => t.status === 'resolved').length,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { subject, priority = 'medium', user } = body as { subject?: string; priority?: string; user?: string };
  if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });

  const newTicket: Ticket = {
    id: `TKT-${String(Date.now()).slice(-4)}`,
    user: user ?? 'unknown',
    subject,
    priority: (priority as Ticket['priority']) ?? 'medium',
    status: 'open',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    assigned: null,
  };

  return NextResponse.json({ ok: true, ticket: newTicket }, { status: 201 });
}
