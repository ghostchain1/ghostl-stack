import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNav, PublicFooter } from '../site/_components/PublicNav';

export const metadata: Metadata = {
  title: 'System Status — GhostChain',
  description: 'Real-time operational status of GhostChain L1, GhostL2, GhostL3, AI systems, and supporting services.',
};

export const revalidate = 30; // ISR: refresh every 30 seconds

/* ── Fetch live status data ─────────────────────────────────────────── */
type LiveService = { id: string; name: string; ok: boolean; status?: string; latencyMs?: number; error?: string };
type LiveChain   = { key: 'l1' | 'l2' | 'l3'; ok: boolean; blockNumber?: string; latencyMs?: number; error?: string };
type LiveStatus  = { generatedAt: string; services: LiveService[]; chains: LiveChain[] };

async function loadLiveStatus(): Promise<LiveStatus | null> {
  try {
    // NEXT_SERVER_URL points to the container's internal address (e.g. http://web:3000)
    // so the self-fetch stays on the internal Docker network in production.
    // Falls back to NEXTAUTH_URL (dev) then localhost.
    const base =
      process.env.NEXT_SERVER_URL ??
      process.env.NEXTAUTH_URL ??
      'http://localhost:3200';
    const res = await fetch(`${base}/api/status`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return res.json() as Promise<LiveStatus>;
  } catch {
    return null;
  }
}

/* ── Design tokens ──────────────────────────────────────────────────────── */
const C = {
  bg:    '#070B10',
  card:  'rgba(255,255,255,0.028)',
  border:'rgba(255,255,255,0.07)',
  text:  '#E8EDF5',
  muted: '#8A9BB5',
  dim:   '#4A5568',
  purple:'#7A5CFF',
  blue:  '#00C2FF',
  teal:  '#00F0B5',
  gold:  '#C9A227',
  red:   '#FF3B3B',
  green: '#00F0B5',
  mono:  "'JetBrains Mono', monospace",
  sans:  "'Inter', system-ui, sans-serif",
  disp:  "'Orbitron', system-ui, sans-serif",
};

type Status = 'operational' | 'degraded' | 'outage' | 'maintenance';

interface ServiceStatus {
  name: string;
  status: Status;
  latency?: string;
  note?: string;
}

interface LayerStatus {
  layer: string;
  layerLabel: string;
  color: string;
  uptime: string;
  blockHeight?: string;
  blockTime?: string;
  services: ServiceStatus[];
}

/* ── Static status data (replace with real API call in production) ────── */
const LAYERS: LayerStatus[] = [
  {
    layer: 'AI', layerLabel: 'Hyper Ghost AI', color: C.teal, uptime: '99.97%',
    services: [
      { name: 'GhostLoad AI',    status: 'operational', latency: '12ms'  },
      { name: 'GhostDNS AI',     status: 'operational', latency: '8ms'   },
      { name: 'Treasury AI',     status: 'operational', latency: '21ms'  },
      { name: 'GhostSentinel',   status: 'operational', latency: '5ms'   },
    ],
  },
  {
    layer: 'L3', layerLabel: 'GhostL3', color: C.blue, uptime: '99.94%',
    blockHeight: '9,204,771', blockTime: '0.8s',
    services: [
      { name: 'Sequencer',       status: 'operational', latency: '44ms'  },
      { name: 'Batcher',         status: 'operational', latency: '120ms' },
      { name: 'RPC (public)',    status: 'operational', latency: '18ms'  },
      { name: 'ZK Prover',       status: 'degraded',    latency: '1.8s', note: 'Elevated proof time — non-critical' },
    ],
  },
  {
    layer: 'L2', layerLabel: 'GhostL2', color: C.purple, uptime: '99.99%',
    blockHeight: '3,847,221', blockTime: '1.2s',
    services: [
      { name: 'Proposer',        status: 'operational', latency: '65ms'  },
      { name: 'GhostXchange',    status: 'operational', latency: '31ms'  },
      { name: 'Liquidity Pools', status: 'operational', latency: '25ms'  },
      { name: 'Bridge Relay',    status: 'operational', latency: '90ms'  },
    ],
  },
  {
    layer: 'L1', layerLabel: 'GhostChain', color: C.gold, uptime: '100%',
    blockHeight: '2,847,331', blockTime: '1.9s',
    services: [
      { name: 'IBFT Consensus',  status: 'operational', latency: '1.9s'  },
      { name: 'TreasuryVault',   status: 'operational', latency: '12ms'  },
      { name: 'GhostGovernor',   status: 'operational', latency: '14ms'  },
      { name: 'RiskOracle',      status: 'operational', latency: '22ms'  },
    ],
  },
];

const INFRA: ServiceStatus[] = [
  { name: 'Block Explorer',     status: 'operational' },
  { name: 'RPC Endpoints',      status: 'operational' },
  { name: 'Faucet (testnet)',    status: 'operational' },
  { name: 'Prometheus Metrics', status: 'operational' },
  { name: 'Grafana Dashboards', status: 'operational' },
  { name: 'API Gateway',        status: 'degraded', note: 'Rate limit headers missing on /v1/audit' },
  { name: 'Docs Site',          status: 'operational' },
  { name: 'Status Page',        status: 'operational' },
];

const INCIDENTS = [
  {
    id: 'INC-2026-0301',
    date: 'Mar 1, 2026 · 14:22 UTC',
    title: 'L3 ZK prover throughput reduced',
    status: 'monitoring',
    severity: 'minor',
    body: 'Elevated proof generation times on L3. Sequencer and batcher unaffected. Root cause identified as memory pressure on prover-03 node. Capacity rebalanced, continuing to monitor.',
  },
  {
    id: 'INC-2026-0228',
    date: 'Feb 28, 2026 · 09:05 UTC',
    title: 'API rate limit headers missing on /v1/audit',
    status: 'investigating',
    severity: 'minor',
    body: 'Rate limiting is enforced correctly but X-RateLimit-* response headers are absent for /v1/audit endpoints. Patch in progress. No data exposure.',
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────── */
const STATUS_META: Record<Status, { label: string; color: string }> = {
  operational:  { label: 'Operational',  color: C.teal   },
  degraded:     { label: 'Degraded',     color: C.gold   },
  outage:       { label: 'Outage',       color: C.red    },
  maintenance:  { label: 'Maintenance',  color: C.purple },
};

const overallStatusFrom = (layers: LayerStatus[], infra: ServiceStatus[]): { label: string; color: string; bg: string } => {
  const allServices = [...layers.flatMap(l => l.services), ...infra];
  const hasOutage   = allServices.some(s => s.status === 'outage');
  const hasDegraded = allServices.some(s => s.status === 'degraded');
  if (hasOutage)   return { label: 'Partial Outage',       color: C.red,  bg: 'rgba(255,59,59,0.06)'  };
  if (hasDegraded) return { label: 'Degraded Performance', color: C.gold, bg: 'rgba(201,162,39,0.06)' };
  return               { label: 'All Systems Operational', color: C.teal, bg: 'rgba(0,240,181,0.06)'  };
};

const StatusDot = ({ status }: { status: Status }) => {
  const { color } = STATUS_META[status];
  return (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0, boxShadow: status === 'operational' ? `0 0 6px ${color}80` : 'none' }} />
  );
};

function ServiceRow({ s }: { s: ServiceStatus }) {
  const { label, color } = STATUS_META[s.status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <StatusDot status={s.status} />
      <span style={{ fontFamily: C.sans, fontSize: '0.8rem', color: C.text, flex: 1 }}>{s.name}</span>
      {s.latency && (
        <span style={{ fontFamily: C.mono, fontSize: '0.65rem', color: C.dim }}>{s.latency}</span>
      )}
      <span style={{ fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700, color, letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default async function StatusPage() {
  // Attempt to fetch live service health from the real API
  const liveData = await loadLiveStatus();

  // Merge live service health into INFRA rows
  const infraWithLive: ServiceStatus[] = INFRA.map(s => {
    if (!liveData) return s;
    const svcName = s.name.toLowerCase();
    const match = liveData.services.find(ls =>
      svcName.includes(ls.name.toLowerCase()) || ls.name.toLowerCase().includes(svcName.split(' ')[0].toLowerCase())
    );
    if (!match) return s;
    return {
      ...s,
      status: match.ok ? 'operational' : 'degraded' as Status,
      latency: match.latencyMs ? `${match.latencyMs}ms` : s.latency,
    };
  });

  // Merge live chain health into LAYERS
  const layersWithLive = LAYERS.map(layer => {
    if (!liveData) return layer;
    const chain = liveData.chains.find(c => c.key === layer.layer.toLowerCase());
    if (!chain) return layer;
    const rawBlock = chain.blockNumber ? parseInt(chain.blockNumber, 16) : NaN;
    const blockNum = Number.isFinite(rawBlock) ? rawBlock.toLocaleString() : layer.blockHeight;
    return {
      ...layer,
      blockHeight: blockNum,
      services: layer.services.map((s, i) =>
        i === 0 && !chain.ok
          ? { ...s, status: 'degraded' as Status, note: chain.error ?? 'rpc_unavailable' }
          : s
      ),
    };
  });

  const overallLayer = overallStatusFrom(layersWithLive, infraWithLive);
  const ts = liveData
    ? new Date(liveData.generatedAt).toUTCString().replace(' GMT', ' UTC')
    : new Date().toUTCString().replace(' GMT', ' UTC') + ' (cached)';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text }}>
      <PublicNav />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(56px,8vw,88px) clamp(16px,4vw,40px) 80px' }}>

        {/* ── Overall status banner ─────────────────────────────────── */}
        <div style={{ background: overallLayer.bg, border: `1px solid ${overallLayer.color}28`, borderRadius: 14, padding: '24px 28px', marginBottom: 40, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: overallLayer.color, display: 'inline-block', boxShadow: `0 0 12px ${overallLayer.color}` }} />
            <span style={{ fontFamily: C.disp, fontSize: 'clamp(1rem,2.2vw,1.4rem)', fontWeight: 700, color: overallLayer.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {overallLayer.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {liveData && <span style={{ fontFamily: C.mono, fontSize: '0.58rem', color: C.teal, background: 'rgba(0,240,181,0.08)', border: '1px solid rgba(0,240,181,0.18)', padding: '2px 8px', borderRadius: 4 }}>LIVE</span>}
            <span style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.dim }}>
              Last checked: {ts}
            </span>
          </div>
        </div>

        {/* ── 30-day uptime pills ───────────────────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontFamily: C.mono, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: C.dim, textTransform: 'uppercase', marginBottom: 14 }}>
            30-DAY UPTIME
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[...layersWithLive].reverse().map(l => (
              <div key={l.layer} style={{ background: `${l.color}0E`, border: `1px solid ${l.color}22`, borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: C.mono, fontSize: '0.62rem', fontWeight: 700, color: l.color, letterSpacing: '0.1em' }}>{l.layer}</span>
                <span style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted }}>{l.layerLabel}</span>
                <span style={{ fontFamily: C.mono, fontSize: '0.72rem', fontWeight: 700, color: C.teal }}>{l.uptime}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Per-layer service status ──────────────────────────────── */}
        <div style={{ fontFamily: C.mono, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: C.dim, textTransform: 'uppercase', marginBottom: 20 }}>
          LAYER-BY-LAYER SERVICES
        </div>
        <div style={{ display: 'grid', gap: 16, marginBottom: 48 }}>
          {layersWithLive.map(layer => (
            <div key={layer.layer} style={{ background: C.card, border: `1px solid ${layer.color}22`, borderRadius: 12, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ background: `${layer.color}0A`, borderBottom: `1px solid ${layer.color}18`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: C.mono, fontSize: '0.62rem', fontWeight: 700, color: layer.color, background: `${layer.color}14`, border: `1px solid ${layer.color}28`, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.1em' }}>
                    {layer.layer}
                  </span>
                  <span style={{ fontFamily: C.sans, fontSize: '0.9rem', fontWeight: 600, color: C.text }}>{layer.layerLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  {layer.blockHeight && (
                    <>
                      <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.dim }}>Block <span style={{ color: C.muted }}>{layer.blockHeight}</span></span>
                      <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.dim }}>Avg <span style={{ color: C.muted }}>{layer.blockTime}</span></span>
                    </>
                  )}
                  <span style={{ fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700, color: C.teal }}>{layer.uptime} up</span>
                </div>
              </div>
              {/* Service rows */}
              <div style={{ padding: '8px 20px 12px' }}>
                {layer.services.map(s => <ServiceRow key={s.name} s={s} />)}
                {layer.services.some(s => s.note) && (
                  layer.services.filter(s => s.note).map(s => (
                    <div key={s.name + '-note'} style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.gold, marginTop: 8, paddingLeft: 18 }}>
                      ↳ {s.name}: {s.note}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Infrastructure services ───────────────────────────────── */}
        <div style={{ fontFamily: C.mono, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: C.dim, textTransform: 'uppercase', marginBottom: 16 }}>
          INFRASTRUCTURE & TOOLING {liveData && <span style={{ color: C.teal }}>· live</span>}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 20px 12px', marginBottom: 48 }}>
          {infraWithLive.map(s => <ServiceRow key={s.name} s={s} />)}
          {infraWithLive.filter(s => s.note).map(s => (
            <div key={s.name + '-note'} style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.gold, marginTop: 6, paddingLeft: 18 }}>
              ↳ {s.name}: {s.note}
            </div>
          ))}
        </div>

        {/* ── Active incidents ──────────────────────────────────────── */}
        <div style={{ fontFamily: C.mono, fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.2em', color: C.dim, textTransform: 'uppercase', marginBottom: 16 }}>
          ACTIVE INCIDENTS ({INCIDENTS.length})
        </div>
        <div style={{ display: 'grid', gap: 12, marginBottom: 48 }}>
          {INCIDENTS.map(inc => (
            <div key={inc.id} style={{ background: 'rgba(201,162,39,0.04)', border: '1px solid rgba(201,162,39,0.18)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontFamily: C.mono, fontSize: '0.6rem', color: C.gold, letterSpacing: '0.1em', marginRight: 10 }}>{inc.id}</span>
                  <span style={{ fontFamily: C.mono, fontSize: '0.55rem', color: C.dim }}>{inc.date}</span>
                </div>
                <span style={{ fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 700, color: C.gold, background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.25)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {inc.status}
                </span>
              </div>
              <div style={{ fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>{inc.title}</div>
              <div style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, lineHeight: 1.6 }}>{inc.body}</div>
            </div>
          ))}
        </div>

        {/* ── Scheduled maintenance ─────────────────────────────────── */}
        <div style={{ background: `rgba(122,92,255,0.05)`, border: '1px solid rgba(122,92,255,0.16)', borderRadius: 10, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 40 }}>
          <span style={{ fontFamily: C.mono, fontSize: '0.62rem', fontWeight: 700, color: C.purple, letterSpacing: '0.1em', flexShrink: 0 }}>MAINTENANCE</span>
          <div>
            <div style={{ fontFamily: C.sans, fontSize: '0.84rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
              L3 prover cluster upgrade — Mar 8, 2026 · 02:00–04:00 UTC
            </div>
            <div style={{ fontFamily: C.sans, fontSize: '0.76rem', color: C.muted }}>
              Rolling upgrade of L3 ZK prover nodes to v2.4.1. No sequencer downtime expected. Proof latency may be elevated by ~30% during the window.
            </div>
          </div>
        </div>

        {/* ── Back to portal ────────────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.purple, textDecoration: 'none' }}>← Portal Hub</Link>
          <Link href="/site" style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, textDecoration: 'none' }}>GhostChain Overview</Link>
          <Link href="/explorer/txs" style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, textDecoration: 'none' }}>Block Explorer</Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
