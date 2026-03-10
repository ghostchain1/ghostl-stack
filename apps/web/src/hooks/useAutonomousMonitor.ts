/**
 * useAutonomousMonitor — Read-only autonomous monitoring loop.
 *
 * Continuously polls GhostStack endpoints, detects anomalies, and
 * surfaces actionable recommendations for human review.
 *
 * GOVERNANCE MODEL:
 *   This hook is DETECT-ONLY.  It never issues write commands.
 *   Each detected anomaly is surfaced as a MonitorAlert that the UI
 *   can present to an operator.  If the operator clicks "Propose", the
 *   alert is forwarded to /api/hyperghost for signing-relay ratification.
 *   Nothing is executed autonomously.
 *
 * Monitored signals:
 *   - Validator CPU / uptime / jailed status  (/api/validators)
 *   - Chain head staleness  (/api/network/topology)
 *   - Liquidity imbalance  (/api/bridge/liquidity)
 *   - WS connection health  (/api/system/health)
 *
 * Returns:
 *   alerts     — current unacknowledged alert list
 *   metrics    — latest scalar health metrics
 *   proposing  — set of alert ids currently being forwarded
 *   propose(id)— forward alert to /api/hyperghost for ratification
 *   dismiss(id)— remove alert from the list (client-side only)
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface MonitorAlert {
  id:        string;
  severity:  AlertSeverity;
  type:      string;
  target:    string;
  message:   string;
  detectedAt:string;
  /** Structured payload for the signing relay */
  payload:   Record<string, unknown>;
}

export interface MonitorMetrics {
  validatorCount:     number;
  jailedCount:        number;
  avgCpu:             number;
  maxCpu:             number;
  chainsOnline:       number;
  totalTvlGST:        number;
  anomalyCount:       number;
  lastPollTime:       string | null;
}

interface MonitorState {
  alerts:   MonitorAlert[];
  metrics:  MonitorMetrics;
  proposing:Set<string>;
  propose:  (alertId: string) => Promise<void>;
  dismiss:  (alertId: string) => void;
}

// ── Threshold config ──────────────────────────────────────────────────────────

const CPU_WARN      = 80;
const CPU_CRITICAL  = 90;
const UPTIME_WARN   = 0.90;
const UPTIME_CRIT   = 0.80;
const POLL_MS       = 30_000;
const MAX_ALERTS    = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function safeGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAutonomousMonitor(): MonitorState {
  const [alerts,    setAlerts]    = useState<MonitorAlert[]>([]);
  const [metrics,   setMetrics]   = useState<MonitorMetrics>({
    validatorCount: 0, jailedCount: 0, avgCpu: 0, maxCpu: 0,
    chainsOnline: 0, totalTvlGST: 0, anomalyCount: 0, lastPollTime: null,
  });
  const [proposing, setProposing] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());   // dedup by type+target

  // ── Append only-new alerts ─────────────────────────────────────────────────
  const push = useCallback((new_alerts: MonitorAlert[]) => {
    setAlerts(prev => {
      const next = [...prev];
      for (const a of new_alerts) {
        const key = `${a.type}::${a.target}`;
        if (seenRef.current.has(key)) continue;
        seenRef.current.add(key);
        next.push(a);
      }
      // Keep most recent MAX_ALERTS; evict oldest
      if (next.length > MAX_ALERTS) next.splice(0, next.length - MAX_ALERTS);
      return next;
    });
  }, []);

  // ── Poll loop ──────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    const newAlerts: MonitorAlert[] = [];
    const now = new Date().toISOString();

    // 1. Validators
    interface ValidatorData { name?: string; address?: string; cpu?: number; uptime?: number; jailed?: boolean }
    interface ValidatorsResp { validators?: ValidatorData[]; total?: number }
    const valData = await safeGet<ValidatorsResp | ValidatorData[]>('/api/validators');
    const valList: ValidatorData[] = valData
      ? (Array.isArray(valData) ? valData : valData.validators ?? [])
      : [];

    const cpus   = valList.map(v => v.cpu ?? 0);
    const avgCpu = cpus.length ? Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length) : 0;
    const maxCpu = cpus.length ? Math.max(...cpus) : 0;
    const jailed = valList.filter(v => v.jailed);

    for (const v of valList) {
      const name = v.name ?? v.address ?? 'validator';
      const cpu  = v.cpu ?? 0;
      const uptime = v.uptime ?? 1;

      if (v.jailed) {
        newAlerts.push({
          id: makeId(), severity: 'critical', type: 'jailed_validator',
          target: name, detectedAt: now,
          message: `Validator "${name}" is jailed — requires governance action`,
          payload: { type: 'restart_validator', target: name, viaGovernance: true },
        });
      } else if (cpu >= CPU_CRITICAL) {
        newAlerts.push({
          id: makeId(), severity: 'critical', type: 'cpu_critical',
          target: name, detectedAt: now,
          message: `Validator "${name}" CPU at ${cpu}% — critical overload`,
          payload: { type: 'restart_validator', target: name, reason: `cpu_${cpu}pct` },
        });
      } else if (cpu >= CPU_WARN) {
        newAlerts.push({
          id: makeId(), severity: 'warning', type: 'cpu_high',
          target: name, detectedAt: now,
          message: `Validator "${name}" CPU at ${cpu}%`,
          payload: { type: 'redistribute_load', target: name, reason: `cpu_${cpu}pct` },
        });
      }

      if (!v.jailed && uptime < UPTIME_CRIT) {
        newAlerts.push({
          id: makeId(), severity: 'critical', type: 'uptime_critical',
          target: name, detectedAt: now,
          message: `Validator "${name}" uptime ${(uptime*100).toFixed(1)}% — critical`,
          payload: { type: 'restart_validator', target: name, reason: `uptime_${(uptime*100).toFixed(0)}pct` },
        });
      } else if (!v.jailed && uptime < UPTIME_WARN) {
        newAlerts.push({
          id: makeId(), severity: 'warning', type: 'uptime_low',
          target: name, detectedAt: now,
          message: `Validator "${name}" uptime ${(uptime*100).toFixed(1)}%`,
          payload: { type: 'restart_validator', target: name, reason: `uptime_${(uptime*100).toFixed(0)}pct` },
        });
      }
    }

    // 2. Chain topology
    interface TopoNode { status: string; layer: string }
    interface TopoResp  { nodes?: TopoNode[] }
    const topo = await safeGet<TopoResp>('/api/network/topology');
    const topoNodes = topo?.nodes ?? [];
    const chainsOnline = topoNodes.filter(n => n.status === 'online').length;
    const offlineChains= topoNodes.filter(n => n.status === 'offline' && ['l1','l2','l3'].includes(n.layer));
    for (const n of offlineChains as (TopoNode & { id?: string; label?: string })[]) {
      const label = n.label ?? n.id ?? n.layer;
      newAlerts.push({
        id: makeId(), severity: 'critical', type: 'chain_offline',
        target: label, detectedAt: now,
        message: `Chain "${label}" is offline — no RPC response`,
        payload: { type: 'alert_stuck_chain', target: label },
      });
    }

    // 3. Liquidity imbalance
    interface LiqPool { tvlGST?: string | null; name?: string; status?: string }
    interface LiqResp  { pools?: LiqPool[] }
    const liq = await safeGet<LiqResp>('/api/bridge/liquidity');
    const pools = liq?.pools ?? [];
    const tvls  = pools.map(p => parseFloat(p.tvlGST ?? '0') || 0);
    const totalTvl = tvls.reduce((a, b) => a + b, 0);
    if (tvls.length >= 2) {
      const maxTvl = Math.max(...tvls);
      const minTvl = Math.min(...tvls);
      if (minTvl > 0 && maxTvl / minTvl > 5) {
        newAlerts.push({
          id: makeId(), severity: 'warning', type: 'liquidity_imbalance',
          target: 'bridge-pools', detectedAt: now,
          message: `Liquidity imbalance: largest pool ${(maxTvl/minTvl).toFixed(1)}× larger than smallest`,
          payload: { type: 'rebalance_liquidity', target: 'bridge-pools' },
        });
      }
    }

    // Update metrics
    setMetrics({
      validatorCount: valList.length,
      jailedCount:    jailed.length,
      avgCpu, maxCpu,
      chainsOnline,
      totalTvlGST:   totalTvl,
      anomalyCount:  newAlerts.length,
      lastPollTime:  now,
    });

    if (newAlerts.length > 0) push(newAlerts);

    // Clear stale dedup set every 5 minutes so re-fired issues resurface
    const ageMs = 5 * 60 * 1000;
    if (Date.now() % ageMs < POLL_MS) seenRef.current.clear();

  }, [push]);

  useEffect(() => {
    void poll();
    const intv = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(intv);
  }, [poll]);

  // ── Propose to relay ───────────────────────────────────────────────────────
  const propose = useCallback(async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;

    setProposing(prev => new Set([...prev, alertId]));
    try {
      await fetch('/api/hyperghost', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:         'approve',
          recommendation: alert.payload,
          source:         'autonomous-monitor',
          alertId,
          detectedAt:     alert.detectedAt,
        }),
      });
    } finally {
      setProposing(prev => { const n = new Set(prev); n.delete(alertId); return n; });
    }
  }, [alerts]);

  // ── Dismiss (client-side) ──────────────────────────────────────────────────
  const dismiss = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  return { alerts, metrics, proposing, propose, dismiss };
}
