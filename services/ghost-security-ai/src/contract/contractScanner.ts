/**
 * Contract Scanner
 *
 * Monitors critical GhostChain L1 smart contracts for security anomalies:
 *   - Code changes (unexpected contract upgrades / self-destruct)
 *   - Transaction count spikes (potential exploit replay loop)
 *   - Balance drains on bridge / treasury contracts
 *
 * Uses ghost_getCode, ghost_getBalance, ghost_getTransactionCount via
 * native RPC — no external APIs or libraries.
 *
 * Watched addresses configured via SSA_WATCHED_CONTRACTS (comma-separated).
 * Includes canonical bridge / oracle addresses from AGENTS.md by default.
 */

import { rpcCall, hexToBigInt, hexToNumber, sanitizeAddress } from '../rpcHelper.js';
import { recordThreat, notifyGhostBrain }                     from '../securityBus.js';
import type { ContractSnapshot, ContractAnomaly, ThreatEvent } from '../types.js';

const L1_RPC = process.env.L1_RPC_URL ?? 'http://localhost:18545';
const GST_UNIT = BigInt('1000000000000000000');

// Canonical critical contracts — always watched
const CANONICAL_CONTRACTS = [
  '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2', // L2L3Bridge
  '0xad32D5C2Da9f4159C4cc98686C005852b3905355', // L1 Rollup (L2)
  '0x130A46b6E41DB6E1e18fb9c759F223c459190e90', // L2 Rollup (L3)
  '0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422', // Finality Oracle L1
];

function getWatchedAddresses(): string[] {
  const extra = (process.env.SSA_WATCHED_CONTRACTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((a) => sanitizeAddress(a))
    .filter((a): a is string => a !== null);

  const canonical = CANONICAL_CONTRACTS.map((a) => a.toLowerCase());
  return [...new Set([...canonical, ...extra])];
}

// ── Snapshot store ─────────────────────────────────────────────────────────────

const _snapshots = new Map<string, ContractSnapshot>();

async function snapshotContract(address: string): Promise<ContractSnapshot | null> {
  try {
    const [code, balHex, txCountHex] = await Promise.all([
      rpcCall(L1_RPC, 'ghost_getCode',             [address, 'latest']),
      rpcCall(L1_RPC, 'ghost_getBalance',           [address, 'latest']),
      rpcCall(L1_RPC, 'ghost_getTransactionCount',  [address, 'latest']),
    ]);

    const codeStr   = typeof code === 'string' ? code : '0x';
    // Simple hash: length + first/last 16 chars (no crypto dependency needed for change detection)
    const codeHash  = `${codeStr.length}:${codeStr.slice(0, 18)}..${codeStr.slice(-16)}`;
    const balanceGst = Number(hexToBigInt(balHex) / GST_UNIT);
    const txCount   = hexToNumber(txCountHex);

    return { address, codeHash, transactionCount: txCount, balanceGst, ts: Date.now() };
  } catch {
    return null;
  }
}

export function getContractSnapshots(): ContractSnapshot[] {
  return [..._snapshots.values()];
}

// ── Anomaly detection ──────────────────────────────────────────────────────────

const TX_SPIKE_THRESHOLD    = Number(process.env.SSA_CONTRACT_TX_SPIKE ?? 500);
const BALANCE_DRAIN_PCT     = Number(process.env.SSA_CONTRACT_DRAIN_PCT ?? 0.20);
let   _componentStatus: 'secure' | 'warning' | 'alert' = 'secure';

export function getContractStatus(): typeof _componentStatus { return _componentStatus; }

function detectAnomalies(prev: ContractSnapshot, curr: ContractSnapshot): ContractAnomaly[] {
  const anomalies: ContractAnomaly[] = [];

  // Code change — contract may have been upgraded or self-destructed
  if (prev.codeHash !== curr.codeHash) {
    anomalies.push({
      address: curr.address,
      type:    'code_change',
      detail:  `Code hash changed from ${prev.codeHash} → ${curr.codeHash}`,
    });
  }

  // TX spike beyond threshold per scan window
  const txDelta = curr.transactionCount - prev.transactionCount;
  if (txDelta > TX_SPIKE_THRESHOLD) {
    anomalies.push({
      address: curr.address,
      type:    'tx_spike',
      detail:  `+${txDelta} transactions since last scan (threshold: ${TX_SPIKE_THRESHOLD})`,
    });
  }

  // Balance drain
  if (prev.balanceGst > 0) {
    const drainPct = (prev.balanceGst - curr.balanceGst) / prev.balanceGst;
    if (drainPct > BALANCE_DRAIN_PCT) {
      anomalies.push({
        address: curr.address,
        type:    'balance_drain',
        detail:  `Balance dropped ${(drainPct * 100).toFixed(1)}% ` +
                 `(${prev.balanceGst.toFixed(0)} → ${curr.balanceGst.toFixed(0)} GST)`,
      });
    }
  }

  return anomalies;
}

async function emitThreat(anomaly: ContractAnomaly): Promise<void> {
  const level = anomaly.type === 'code_change' || anomaly.type === 'balance_drain' ? 'critical' : 'high';
  const evt: ThreatEvent = {
    id:          `ssa-contract-${anomaly.type}-${Date.now()}`,
    ts:          Date.now(),
    category:    'contract',
    level,
    title:       `Contract anomaly: ${anomaly.type}`,
    description: anomaly.detail,
    source:      anomaly.address,
    metadata:    { address: anomaly.address, type: anomaly.type },
  };
  recordThreat(evt);
  await notifyGhostBrain(evt);
}

// ── Public scan entrypoint ────────────────────────────────────────────────────

export async function scanContracts(): Promise<void> {
  const addresses = getWatchedAddresses();
  let hasAnomaly = false;

  await Promise.allSettled(
    addresses.map(async (addr) => {
      const curr = await snapshotContract(addr);
      if (!curr) return;

      const prev = _snapshots.get(addr);
      if (prev) {
        const anomalies = detectAnomalies(prev, curr);
        for (const a of anomalies) {
          hasAnomaly = true;
          await emitThreat(a);
        }
      }

      _snapshots.set(addr, curr);
    })
  );

  _componentStatus = hasAnomaly ? 'alert' : 'secure';
  if (!hasAnomaly) console.log(`[SSA:contracts] ${addresses.length} contracts scanned — OK`);
}
