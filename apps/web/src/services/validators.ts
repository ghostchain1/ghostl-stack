/**
 * validators.ts — Validator set service client.
 *
 * Queries aggregated validator data from the BFF, which in turn proxies to
 * the ghost-api (Express BFF) validator endpoints.
 *
 * Covers:
 *  - Active validator list with stake / commission / power
 *  - Per-validator performance: missed blocks, latency, uptime
 *  - Slashing events
 *  - Participation rate over time (for charts)
 *  - Individual validator control (jailing, unjailing) — ADMIN only
 */

// ── Data shapes ──────────────────────────────────────────────────────────────

export type ValidatorStatus = 'active' | 'jailed' | 'unbonding' | 'inactive';

export interface ValidatorSummary {
  id:           string;   // moniker or address
  address:      string;
  status:       ValidatorStatus;
  stakeGst:     string;   // human-readable (e.g. "1,500,000 GST")
  commission:   number;   // 0–1
  power:        number;   // voting power (absolute)
  powerPct:     number;   // 0–1 fraction of total
}

export interface ValidatorPerf {
  address:        string;
  uptimePct:      number;   // 0–100
  missedBlocks:   number;
  latencyMs:      number | null;
  lastSignedBlock: number | null;
  cpuPct:         number | null;
  memPct:         number | null;
  syncPct:        number;   // 0–100
}

export interface SlashEvent {
  validatorAddress: string;
  reason:           'double_sign' | 'downtime' | 'equivocation';
  slashedAmount:    string;
  height:           number;
  timestamp:        string;
}

export interface ValidatorDetail extends ValidatorSummary {
  perf:         ValidatorPerf;
  slashEvents:  SlashEvent[];
  delegators:   number | null;
  website:      string | null;
  description:  string | null;
}

export interface ParticipationPoint {
  timestamp:    string;
  ratePct:      number;
}

// ── BFF helper ───────────────────────────────────────────────────────────────

async function bff<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Validators BFF ${path} → HTTP ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Full validator set with summary info. */
export async function fetchValidators(): Promise<ValidatorSummary[]> {
  const data = await bff<{ validators?: ValidatorSummary[] }>('/api/validators');
  return data.validators ?? [];
}

/** Per-validator performance metrics. */
export async function fetchValidatorPerf(): Promise<ValidatorPerf[]> {
  const data = await bff<{ metrics?: ValidatorPerf[] }>('/api/validators/metrics');
  return data.metrics ?? [];
}

/** Detailed info + slashing history for one validator. */
export async function fetchValidatorDetail(address: string): Promise<ValidatorDetail> {
  // Sanitise: only hex addresses, ENS-like names, or bech32
  if (!/^[a-zA-Z0-9._\-]{1,100}$/.test(address)) {
    throw new Error('invalid validator address');
  }
  return bff<ValidatorDetail>(`/api/validators/${encodeURIComponent(address)}`);
}

/** Recent slashing events across all validators. */
export async function fetchSlashEvents(limit = 20): Promise<SlashEvent[]> {
  const data = await bff<{ events?: SlashEvent[] }>(
    `/api/validators/slash-events?limit=${limit}`,
  );
  return data.events ?? [];
}

/** Participation rate time series (for chart rendering). */
export async function fetchParticipationHistory(window: '24h' | '7d' | '30d' = '24h'): Promise<ParticipationPoint[]> {
  const data = await bff<{ points?: ParticipationPoint[] }>(
    `/api/validators/participation?window=${window}`,
  );
  return data.points ?? [];
}

/** Unjail a validator (requires ADMIN role). */
export async function unjailValidator(address: string): Promise<{ queued: boolean }> {
  if (!/^[a-zA-Z0-9._\-]{1,100}$/.test(address)) {
    throw new Error('invalid validator address');
  }
  return bff(`/api/validators/${encodeURIComponent(address)}/unjail`, {
    method: 'POST',
  });
}
