import { NextResponse } from 'next/server';

const TREASURY_ENGINE_URL = process.env['TREASURY_ENGINE_URL'] ?? 'http://localhost:7683';

type TreasuryResponse = {
  balance?: string;
  balanceFormatted?: string;
  pendingRewards?: string;
  totalDistributed?: string;
  lastDistributionBlock?: number;
  reserveRatio?: number;
};

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${TREASURY_ENGINE_URL}/api/v1/status`, {
      signal: AbortSignal.timeout(6_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as TreasuryResponse;
    return NextResponse.json({
      balance:               data.balance              ?? '0',
      balanceFormatted:      data.balanceFormatted     ?? '0',
      pendingRewards:        data.pendingRewards        ?? '0',
      totalDistributed:      data.totalDistributed      ?? '0',
      lastDistributionBlock: data.lastDistributionBlock ?? 0,
      reserveRatio:          data.reserveRatio          ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'treasury engine unreachable' },
      { status: 502 },
    );
  }
}
