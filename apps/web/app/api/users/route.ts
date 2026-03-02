import { NextRequest, NextResponse } from 'next/server';

export type UserRole   = 'user' | 'employee' | 'admin' | 'validator';
export type UserStatus = 'active' | 'suspended' | 'pending-kyc' | 'banned';

export type GhostUser = {
  address:  string;
  alias:    string;
  role:     UserRole;
  status:   UserStatus;
  kyc:      boolean;
  joined:   string;
  lastSeen: string;
  staked:   string;
};

const USERS: GhostUser[] = [
  { address: '0x1F3a…F3a',   alias: 'ghost-user-1',  role: 'user',      status: 'active',      kyc: true,  joined: '2025-10-14', lastSeen: '2026-03-01', staked: '12,400 GST'    },
  { address: '0xB841…E2D3',  alias: 'validator-07',  role: 'validator', status: 'active',      kyc: true,  joined: '2025-08-02', lastSeen: '2026-03-01', staked: '2,000,000 GST' },
  { address: '0x4a2F…C3D1',  alias: 'bridge-user-4', role: 'user',      status: 'active',      kyc: true,  joined: '2025-11-20', lastSeen: '2026-03-01', staked: '3,200 GST'     },
  { address: '0x7cD4…F298',  alias: 'anon-7cD4',     role: 'user',      status: 'pending-kyc', kyc: false, joined: '2026-01-05', lastSeen: '2026-03-01', staked: '0 GST'         },
  { address: '0xF2a3…B4C5',  alias: 'nakamura-k',    role: 'user',      status: 'pending-kyc', kyc: false, joined: '2026-02-28', lastSeen: '2026-02-28', staked: '0 GST'         },
  { address: '0xA1b2…3C4D',  alias: 'emp-staker-1',  role: 'employee',  status: 'active',      kyc: true,  joined: '2025-09-15', lastSeen: '2026-03-01', staked: '8,750 GST'     },
  { address: '0x9E8f…1B2C',  alias: 'dev-tester-9',  role: 'user',      status: 'suspended',   kyc: true,  joined: '2025-12-10', lastSeen: '2026-02-20', staked: '500 GST'       },
  { address: '0xD5e6…23A1',  alias: 'santamaria-l',  role: 'user',      status: 'active',      kyc: false, joined: '2026-02-28', lastSeen: '2026-02-28', staked: '0 GST'         },
  { address: '0x3aB1…C7E9',  alias: 'okonkwo-a',     role: 'user',      status: 'pending-kyc', kyc: false, joined: '2026-03-01', lastSeen: '2026-03-01', staked: '0 GST'         },
  { address: '0xC0mp…L14nc', alias: 'compliance-1',  role: 'admin',     status: 'active',      kyc: true,  joined: '2025-07-01', lastSeen: '2026-03-01', staked: '50,000 GST'    },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role   = searchParams.get('role')   as UserRole | null;
  const status = searchParams.get('status') as UserStatus | null;
  const q      = searchParams.get('q')?.toLowerCase();

  let data = USERS;
  if (role)   data = data.filter(u => u.role === role);
  if (status) data = data.filter(u => u.status === status);
  if (q)      data = data.filter(u => u.alias.toLowerCase().includes(q) || u.address.toLowerCase().includes(q));

  return NextResponse.json({
    users: data,
    total: data.length,
    stats: {
      total:      USERS.length,
      active:     USERS.filter(u => u.status === 'active').length,
      pendingKyc: USERS.filter(u => u.status === 'pending-kyc').length,
      suspended:  USERS.filter(u => u.status === 'suspended' || u.status === 'banned').length,
    },
  });
}

export async function PATCH(req: NextRequest) {
  // Update user role or status — in prod: verify admin session, apply on-chain/DB
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, updated: body });
}
