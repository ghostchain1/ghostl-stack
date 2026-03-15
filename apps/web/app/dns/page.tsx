'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DnsRecord {
  fqdn: string;
  type: string;
  value: string;
  ttl: number;
}

interface AnomalyEvent {
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  ts: number;
}

interface DomainStatus {
  domain: string;
  expiry_days: number | null;
  severity: 'ok' | 'warning' | 'critical' | 'unknown';
  detail: string;
}

interface CertStatus {
  domain: string;
  expiry_days: number | null;
  severity: 'ok' | 'warning' | 'critical' | 'unknown';
  detail: string;
  renewed: boolean;
}

interface IntelligenceSummary {
  anomalies: { count: number; items: AnomalyEvent[] };
  domains:   { count: number; items: DomainStatus[] };
  certs:     { count: number; items: CertStatus[] };
  detector:  { tracked_fqdns: number; fqdns_with_ip_change_history: number };
}

interface ZoneInfo {
  ok: boolean;
  zone: string;
}

interface MultiRecordList {
  ok: boolean;
  records: DnsRecord[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BRAIN_BASE = '/api/brain';   // Next.js BFF proxy prefix
const DNS_PREFIX = `${BRAIN_BASE}/dns`;

const SEVERITY_COLOR: Record<string, string> = {
  ok:       'text-green-400',
  warning:  'text-yellow-400',
  critical: 'text-red-400',
  unknown:  'text-gray-400',
  info:     'text-blue-400',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function SeverityBadge({ sev }: { sev: string }) {
  return (
    <span className={`font-semibold uppercase text-xs ${SEVERITY_COLOR[sev] ?? 'text-gray-400'}`}>
      {sev}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-lg">
      <h2 className="mb-4 text-lg font-bold text-purple-400">{title}</h2>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GhostDnsPage() {
  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null);
  const [zone,         setZone]         = useState<ZoneInfo | null>(null);
  const [multiRecords, setMultiRecords] = useState<DnsRecord[]>([]);
  const [health,       setHealth]       = useState<{ ok: boolean; named_running: boolean; mode: string } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [intel, zoneData, multiData, healthData] = await Promise.allSettled([
          fetchJson<IntelligenceSummary>(`${DNS_PREFIX}/intelligence/summary`),
          fetchJson<ZoneInfo>(`${DNS_PREFIX}/zone`),
          fetchJson<MultiRecordList>(`${DNS_PREFIX}/records/multi`),
          fetchJson<{ ok: boolean; named_running: boolean; mode: string }>(`${DNS_PREFIX}/health`),
        ]);

        if (!mounted) return;

        if (intel.status === 'fulfilled') setIntelligence(intel.value);
        if (zoneData.status === 'fulfilled') setZone(zoneData.value);
        if (multiData.status === 'fulfilled') setMultiRecords(multiData.value.records ?? []);
        if (healthData.status === 'fulfilled') setHealth(healthData.value);
      } catch (err) {
        if (mounted) setError(String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const iv = setInterval(load, 30_000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-purple-400">
        <p className="animate-pulse text-xl">Loading GhostDNS AI…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-gray-100">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-purple-400">
          GhostDNS AI — Autonomous Domain Management
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          AI-driven DNS orchestration · Bind9 zone management · Cloudflare sync ·
          Certificate automation · Anomaly detection
        </p>
        {error && (
          <p className="mt-2 rounded border border-red-700 bg-red-950 p-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Service Health ─────────────────────────────────────────── */}
        <SectionCard title="Service Health">
          {health ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-400">Status</dt>
                <dd className={health.ok ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {health.ok ? '● ONLINE' : '● OFFLINE'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Named (Bind9)</dt>
                <dd className={health.named_running ? 'text-green-400' : 'text-red-400'}>
                  {health.named_running ? 'running' : 'stopped'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Mode</dt>
                <dd className="text-purple-300 uppercase font-semibold">{health.mode}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Tracked FQDNs</dt>
                <dd className="font-mono">{intelligence?.detector.tracked_fqdns ?? '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-gray-500 text-sm">Unavailable</p>
          )}
        </SectionCard>

        {/* ── AI Anomaly Detector ─────────────────────────────────────── */}
        <SectionCard title="AI Anomaly Detector">
          {intelligence && intelligence.anomalies.count > 0 ? (
            <ul className="space-y-2 text-sm">
              {intelligence.anomalies.items.map((a, i) => (
                <li key={i} className="rounded border border-gray-700 bg-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-200">{a.kind.replace(/_/g, ' ')}</span>
                    <SeverityBadge sev={a.severity} />
                  </div>
                  <p className="mt-1 text-gray-400">{a.detail}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    {new Date(a.ts * 1000).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-green-400 text-sm font-semibold">
              ✓ No anomalies detected
            </p>
          )}
          <p className="mt-3 text-xs text-gray-500">
            IP-change tracked: {intelligence?.detector.fqdns_with_ip_change_history ?? 0}
          </p>
        </SectionCard>

        {/* ── Domain Guardian ─────────────────────────────────────────── */}
        <SectionCard title="Domain Guardian">
          {intelligence && intelligence.domains.items.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {intelligence.domains.items.map((d, i) => (
                <li key={i} className="rounded border border-gray-700 bg-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-200">{d.domain}</span>
                    <SeverityBadge sev={d.severity} />
                  </div>
                  <p className="mt-1 text-gray-400">{d.detail}</p>
                  {d.expiry_days !== null && (
                    <p className="mt-1 text-xs text-gray-500">
                      {d.expiry_days.toFixed(1)} days remaining
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">
              Configure <code className="text-purple-400">GHOSTDNS_WATCHED_DOMAINS</code> and{' '}
              <code className="text-purple-400">GHOSTDNS_WHOIS_PROXY_URL</code> to enable
              domain expiry monitoring.
            </p>
          )}
        </SectionCard>

        {/* ── Certificate Status ──────────────────────────────────────── */}
        <SectionCard title="TLS Certificate Status">
          {intelligence && intelligence.certs.items.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {intelligence.certs.items.map((c, i) => (
                <li key={i} className="rounded border border-gray-700 bg-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-200">{c.domain}</span>
                    <SeverityBadge sev={c.severity} />
                  </div>
                  <p className="mt-1 text-gray-400">{c.detail}</p>
                  {c.renewed && (
                    <p className="mt-1 text-xs text-green-400">Auto-renewed this cycle</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">
              Configure <code className="text-purple-400">GHOSTDNS_CERTBOT_DOMAINS</code> to
              enable certificate monitoring &amp; auto-renewal.
            </p>
          )}
        </SectionCard>

        {/* ── Multi-type Records ──────────────────────────────────────── */}
        <SectionCard title="DNS Records (CNAME / TXT / MX / SRV / CAA / AAAA)">
          {multiRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-700">
                    <th className="pb-2 pr-4">FQDN</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Value</th>
                    <th className="pb-2">TTL</th>
                  </tr>
                </thead>
                <tbody>
                  {multiRecords.map((r, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800">
                      <td className="py-2 pr-4 font-mono text-xs text-gray-300">{r.fqdn}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-purple-900 px-1.5 py-0.5 text-xs text-purple-200">
                          {r.type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-400 max-w-xs truncate">
                        {r.value}
                      </td>
                      <td className="py-2 text-xs text-gray-500">{r.ttl}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No multi-type records configured.</p>
          )}
        </SectionCard>

        {/* ── Zone File Preview ───────────────────────────────────────── */}
        <SectionCard title="Active Zone File">
          {zone?.zone ? (
            <pre className="max-h-72 overflow-y-auto rounded bg-gray-800 p-3 text-xs text-gray-300 leading-relaxed whitespace-pre">
              {zone.zone}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">Zone file unavailable.</p>
          )}
        </SectionCard>

      </div>

      <footer className="mt-8 text-center text-xs text-gray-600">
        GhostDNS AI · GhostBrain Core integration · Auto-refreshes every 30 s ·
        Governed by GhostChain Sovereign Policy
      </footer>
    </div>
  );
}
