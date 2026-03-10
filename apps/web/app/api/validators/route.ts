/**
 * /api/validators — Unified validator aggregate.
 *
 * Proxies to:
 *   1. GhostBrain Core /validators/list      (L1 validators, port 7900)
 *   2. GhostBrain Core /validators/perf      (performance data)
 *   3. Cosmos LCD /cosmos/staking/v1beta1/validators (sovereign staking set)
 *
 * Returns a combined shape for the dashboard and validator monitor widgets.
 *
 * Env vars:
 *   GHOSTBRAIN_INTERNAL   default http://localhost:7900
 *   COSMOS_LCD_URL        default http://localhost:1317
 */

import { NextResponse } from 'next/server';

const BRAIN_URL    = process.env.GHOSTBRAIN_INTERNAL ?? 'http://localhost:7900';
const COSMOS_LCD   = process.env.COSMOS_LCD_URL       ?? 'http://localhost:1317';

interface ValidatorRaw {
  address?: string;
  moniker?: string;
  name?: string;
  votingPower?: number;
  tokens?: string;
  uptime?: number;
  status?: string;
  jailed?: boolean;
  commission?: number;
}

interface CosmosValidator {
  operator_address?: string;
  description?: { moniker?: string };
  tokens?: string;
  status?: string;
  jailed?: boolean;
  commission?: { commission_rates?: { rate?: string } };
}

async function safeFetch<T>(url: string, label: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    console.warn(`validators BFF: ${label} unavailable`);
    return null;
  }
}

export async function GET() {
  const [brainList, brainPerf, cosmosRaw] = await Promise.all([
    safeFetch<{ validators: ValidatorRaw[] }>(`${BRAIN_URL}/validators/list`, 'brain-list'),
    safeFetch<{ validators: ValidatorRaw[] }>(`${BRAIN_URL}/validators/perf`, 'brain-perf'),
    safeFetch<{ validators: CosmosValidator[] }>(
      `${COSMOS_LCD}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=50`,
      'cosmos-lcd',
    ),
  ]);

  // Merge: brain data is authoritative; supplement from Cosmos LCD when brain is down
  const validators: ValidatorRaw[] = brainList?.validators?.length
    ? brainList.validators.map(v => ({
        ...v,
        uptime: brainPerf?.validators?.find(p => p.address === v.address)?.uptime ?? v.uptime,
      }))
    : (cosmosRaw?.validators ?? []).map((v): ValidatorRaw => ({
        address:     v.operator_address,
        moniker:     v.description?.moniker ?? 'unknown',
        tokens:      v.tokens,
        status:      v.status === 'BOND_STATUS_BONDED' ? 'active' : 'inactive',
        jailed:      v.jailed ?? false,
        commission:  parseFloat(v.commission?.commission_rates?.rate ?? '0'),
      }));

  return NextResponse.json(
    {
      validators,
      total:   validators.length,
      active:  validators.filter(v => !v.jailed && v.status === 'active').length,
      jailed:  validators.filter(v => v.jailed).length,
      sources: {
        brain: brainList !== null,
        cosmos: cosmosRaw !== null,
      },
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
