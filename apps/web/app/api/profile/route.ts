import { NextResponse } from 'next/server';

export async function GET() {
  // In production: derive from session token + on-chain lookup
  return NextResponse.json({
    address:      '0x1F3a4b8c9D2e5F6a7B3c4D5e6F7a8B9c0D1E2F3a',
    alias:        'ghost-user-1',
    tier:         'Standard',
    since:        '2025-10-14T00:00:00Z',
    kycStatus:    'Verified',
    network:      'mainnet',
    staking: {
      delegatedTo:  '0xB841000000000000000000000000000000000E2D3',
      stakedGST:    '12400',
      pendingYield: '0.00042',
    },
    sessions: [
      { device: 'Chrome / Linux',  last: '2026-03-01T14:30:00Z', current: true  },
      { device: 'Firefox / macOS', last: '2026-02-28T09:15:00Z', current: false },
    ],
    keys: [
      { label: 'Default signing key',       type: 'secp256k1', added: '2025-10-14', active: true  },
      { label: 'Hardware wallet (Ledger)',   type: 'secp256k1', added: '2026-01-03', active: true  },
    ],
  });
}

export async function PATCH() {
  // Update alias, notification preferences, etc.
  return NextResponse.json({ ok: true });
}
