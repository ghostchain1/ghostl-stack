'use client';

import React, { useCallback, useEffect, useState } from 'react';

// ── Types (portal-side, reflect SSA /status shape) ────────────────────────────

type ThreatLevel    = 'none' | 'low' | 'medium' | 'high' | 'critical';
type ComponentStatus = 'secure' | 'warning' | 'alert' | 'unknown';

interface ThreatEvent {
  id:          string;
  ts:          number;
  category:    string;
  level:       ThreatLevel;
  title:       string;
  description: string;
  source?:     string;
}

interface SecurityProposal {
  id:          string;
  ts:          number;
  mitigation:  string;
  level:       ThreatLevel;
  description: string;
  advisory:    true;
}

interface Components {
  contracts:  ComponentStatus;
  validators: ComponentStatus;
  rpc:        ComponentStatus;
  treasury:   ComponentStatus;
  network:    ComponentStatus;
}

interface SsaStatus {
  running:            boolean;
  dryRun:             boolean;
  totalCycles:        number;
  errors:             number;
  proposals:          number;
  lastCycleMs:        number | null;
  uptime:             number;
  overallThreatLevel: ThreatLevel;
  components:         Components;
  recentThreats:      ThreatEvent[];
  recentProposals:    SecurityProposal[];
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const THREAT_COLOUR: Record<ThreatLevel, string> = {
  none:     'text-green-400',
  low:      'text-green-300',
  medium:   'text-yellow-400',
  high:     'text-orange-400',
  critical: 'text-red-500',
};

const THREAT_BG: Record<ThreatLevel, string> = {
  none:     'bg-green-900/30 border-green-700',
  low:      'bg-green-900/20 border-green-700',
  medium:   'bg-yellow-900/30 border-yellow-700',
  high:     'bg-orange-900/30 border-orange-700',
  critical: 'bg-red-900/40 border-red-600',
};

const STATUS_COLOUR: Record<ComponentStatus, string> = {
  secure:  'bg-green-700',
  warning: 'bg-yellow-600',
  alert:   'bg-red-600',
  unknown: 'bg-gray-600',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ThreatBadge({ level }: { level: ThreatLevel }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${THREAT_COLOUR[level]}`}>
      {level}
    </span>
  );
}

function ComponentTile({ label, status }: { label: string; status: ComponentStatus }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-gray-800 rounded-lg p-3 min-w-[100px]">
      <span className={`w-3 h-3 rounded-full ${STATUS_COLOUR[status]}`} />
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className="text-xs font-bold" style={{ color: status === 'secure' ? '#4ade80' : status === 'warning' ? '#facc15' : '#f87171' }}>
        {status.toUpperCase()}
      </span>
    </div>
  );
}

function OverallBanner({ level }: { level: ThreatLevel }) {
  const labels: Record<ThreatLevel, string> = {
    none:     'ALL SYSTEMS SECURE',
    low:      'LOW-LEVEL ANOMALY DETECTED',
    medium:   'MEDIUM THREAT DETECTED',
    high:     'HIGH THREAT — PROPOSALS PENDING',
    critical: 'CRITICAL THREAT — IMMEDIATE ACTION REQUIRED',
  };
  return (
    <div className={`rounded-xl border-2 p-4 flex items-center gap-3 ${THREAT_BG[level]}`}>
      <span className={`text-2xl font-extrabold ${THREAT_COLOUR[level]}`}>
        {level === 'none' ? '✔' : level === 'critical' ? '⚠' : '◉'}
      </span>
      <div>
        <p className={`font-bold text-sm ${THREAT_COLOUR[level]}`}>{labels[level]}</p>
        <p className="text-xs text-gray-400">Overall network threat level</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;

async function fetchSsa(view: string): Promise<unknown> {
  const res = await fetch(`/api/security-ai?view=${view}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`SSA API error: ${res.status}`);
  return res.json();
}

export function SecurityAIPage() {
  const [status, setStatus]   = useState<SsaStatus | null>(null);
  const [error,  setError]    = useState<string | null>(null);
  const [lastAt, setLastAt]   = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSsa('status') as SsaStatus;
      setStatus(data);
      setLastAt(Date.now());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <div className="p-6 text-red-400">
        <p className="font-bold">SSA offline</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!status) {
    return <div className="p-6 text-gray-400 animate-pulse">Loading Security AI…</div>;
  }

  const uptimeMins = Math.floor(status.uptime / 60_000);

  return (
    <div className="space-y-6 p-4 md:p-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">Sovereign Security AI</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Cycles: {status.totalCycles} &middot; Errors: {status.errors} &middot;
            Uptime: {uptimeMins}m &middot; Last scan: {status.lastCycleMs != null ? `${status.lastCycleMs}ms` : '—'}
            {status.dryRun && <span className="ml-2 text-yellow-400 font-semibold">[DRY RUN]</span>}
          </p>
        </div>
        {lastAt && (
          <span className="text-xs text-gray-500">
            Updated {new Date(lastAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Overall threat banner */}
      <OverallBanner level={status.overallThreatLevel} />

      {/* Component health grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Component Health</h2>
        <div className="flex flex-wrap gap-3">
          <ComponentTile label="Contracts"  status={status.components.contracts}  />
          <ComponentTile label="Validators" status={status.components.validators} />
          <ComponentTile label="RPC"        status={status.components.rpc}        />
          <ComponentTile label="Treasury"   status={status.components.treasury}   />
          <ComponentTile label="Network"    status={status.components.network}    />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Threats Recorded',  value: status.recentThreats.length },
          { label: 'Proposals Queued',  value: status.proposals },
          { label: 'Scan Errors',       value: status.errors },
          { label: 'Cycles Completed',  value: status.totalCycles },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-white">{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Recent threats */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Recent Threat Events</h2>
        {status.recentThreats.length === 0 ? (
          <p className="text-sm text-gray-500">No threats detected.</p>
        ) : (
          <div className="space-y-2">
            {status.recentThreats.slice(0, 10).map((t) => (
              <div key={t.id} className={`rounded-lg border p-3 ${THREAT_BG[t.level]}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{t.title}</span>
                  <div className="flex items-center gap-2">
                    <ThreatBadge level={t.level} />
                    <span className="text-xs text-gray-400 uppercase">{t.category}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-300 mt-1">{t.description}</p>
                {t.source && (
                  <p className="text-xs text-gray-500 mt-1 font-mono">
                    source: {t.source}
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-1">{new Date(t.ts).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent proposals */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Security Proposals (Advisory)</h2>
        {status.recentProposals.length === 0 ? (
          <p className="text-sm text-gray-500">No proposals generated.</p>
        ) : (
          <div className="space-y-2">
            {status.recentProposals.slice(0, 5).map((p) => (
              <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-mono text-yellow-300">{p.mitigation}</span>
                  <div className="flex gap-2 items-center">
                    <ThreatBadge level={p.level} />
                    <span className="text-xs bg-blue-900 text-blue-300 rounded px-1.5 py-0.5 font-semibold">
                      ADVISORY
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">{p.description}</p>
                <p className="text-xs text-gray-600 mt-1">{new Date(p.ts).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Governance disclaimer */}
      <div className="rounded-lg bg-blue-950/40 border border-blue-800 p-3 text-xs text-blue-300">
        <span className="font-semibold">Governance notice:</span> All security mitigations are advisory proposals.
        Execution requires ratification via the GhostChain governance signing relay.
        No autonomous on-chain actions are taken by this module.
      </div>

    </div>
  );
}
