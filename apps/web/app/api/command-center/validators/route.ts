import { NextResponse } from 'next/server';

const COSMOS_LCD = process.env['COSMOS_LCD_URL'] ?? 'http://localhost:1317';

type CosmosValidator = {
  operator_address: string;
  description: { moniker: string };
  tokens: string;
  jailed: boolean;
  status: string;
};

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(
      `${COSMOS_LCD}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=50`,
      { signal: AbortSignal.timeout(6_000), headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { validators: CosmosValidator[]; pagination?: { total?: string } };
    const validators = (data.validators ?? []).map((v) => ({
      address:    v.operator_address,
      moniker:    v.description?.moniker ?? '',
      power:      v.tokens ?? '0',
      uptime:     100,   // real uptime requires slashing params; placeholder until slashing endpoint wired
      status:     v.jailed ? 'jailed' : v.status === 'BOND_STATUS_BONDED' ? 'active' : 'inactive',
    }));

    const totalPower = validators
      .reduce((acc, v) => acc + BigInt(v.power), 0n)
      .toLocaleString();

    return NextResponse.json({
      validators,
      totalPower,
      activeCount: validators.filter((v) => v.status === 'active').length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cosmos LCD unreachable' },
      { status: 502 },
    );
  }
}
