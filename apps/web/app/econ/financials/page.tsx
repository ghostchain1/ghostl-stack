import type { Metadata } from 'next';
import Link from 'next/link';
import { LayerBadge } from '@/components/brand/LayerBadge';

export const metadata: Metadata = {
  title: 'GhostStack — 5-Year Financial Model',
  description:
    'GhostStack 5-Year Financial Projection Model v1.0. Institutional scenario analysis: Bear, Base, and Bull projections for revenue, treasury, GST supply, and validator economics.',
};

// ── Revenue trajectory ───────────────────────────────────────────────────
const revenueByYear = [
  { year: 'Y1 (2026)', bear: '$1.15M', base: '$7.57M',   bull: '$16.97M',  phase: 'Foundation' },
  { year: 'Y2 (2027)', bear: '$1.72M', base: '$18.93M',  bull: '$67.89M',  phase: 'Growth'     },
  { year: 'Y3 (2028)', bear: '$2.59M', base: '$47.34M',  bull: '$271.56M', phase: 'Expansion'  },
  { year: 'Y4 (2029)', bear: '$3.88M', base: '$118.34M', bull: '$1.09B',   phase: 'Scale'      },
  { year: 'Y5 (2030)', bear: '$5.82M', base: '$295.85M', bull: '$4.34B',   phase: 'Maturity'   },
];

// ── Treasury growth ───────────────────────────────────────────────────────
const treasuryByYear = [
  { year: 'Y1', bear: '$0.91M', base: '$5.96M',   bull: '$13.37M'  },
  { year: 'Y2', bear: '$2.31M', base: '$21.23M',  bull: '$70.71M'  },
  { year: 'Y3', bear: '$4.43M', base: '$60.27M',  bull: '$316.38M' },
  { year: 'Y4', bear: '$7.65M', base: '$158.04M', bull: '$1.26B'   },
  { year: 'Y5', bear: '$12.55M',base: '$402.13M', bull: '$4.89B'   },
];

// ── GST cumulative burn ─────────────────────────────────────────────────
const gstBurnByYear = [
  { year: 'Y1', bear: '294,618',    base: '1,940,752',   bull: '4,349,203'   },
  { year: 'Y2', bear: '203,970',    base: '2,150,750',   bull: '9,288,000'   },
  { year: 'Y3', bear: '79,339',     base: '1,477,719',   bull: '11,731,200'  },
  { year: 'Y4', bear: '41,369',     base: '1,240,599',   bull: '13,541,600'  },
  { year: 'Y5', bear: '39,332',     base: '1,849,398',   bull: '28,719,840'  },
  { year: '5Y Total', bear: '658,628', base: '8,659,218', bull: '67,629,843' },
];

// ── Circulating supply projection ────────────────────────────────────────
const supplyByYear = [
  { year: 'Y0',  bear: '1,000,000,000', base: '1,000,000,000', bull: '1,000,000,000' },
  { year: 'Y1',  bear: '999,834,718',   base: '998,911,252',   bull: '997,560,203'   },
  { year: 'Y2',  bear: '999,762,748',   base: '998,032,502',   bull: '996,285,803'   },
  { year: 'Y3',  bear: '999,738,609',   base: '997,616,783',   bull: '995,417,003'   },
  { year: 'Y4',  bear: '999,728,240',   base: '997,278,184',   bull: '994,475,403'   },
  { year: 'Y5',  bear: '999,720,008',   base: '996,760,786',   bull: '988,435,563'   },
];

// ── Validator APY (base scenario) ────────────────────────────────────────
const validatorApy = [
  { year: 'Y1 (2026)', count: 25,  pool: '$852,004',   perValidator: '$34,080', apy: '34.1%' },
  { year: 'Y2 (2027)', count: 35,  pool: '$1,272,000', perValidator: '$36,343', apy: '14.5%' },
  { year: 'Y3 (2028)', count: 50,  pool: '$1,062,000', perValidator: '$21,240', apy: '8.5%'  },
  { year: 'Y4 (2029)', count: 75,  pool: '$902,000',   perValidator: '$12,027', apy: '4.8%'  },
  { year: 'Y5 (2030)', count: 100, pool: '$1,332,000', perValidator: '$13,320', apy: '5.3%'  },
];

// ── Y1 KPIs (base scenario) ───────────────────────────────────────────────
const y1Kpis = [
  { kpi: 'Daily L3 transactions',  target: '500,000',    unit: 'tx/day'   },
  { kpi: 'Daily L2 swaps',         target: '100,000',    unit: 'swaps/day' },
  { kpi: 'Treasury balance',       target: '$5.96M',     unit: 'USD'      },
  { kpi: 'Active validators',      target: '25',         unit: 'nodes'    },
  { kpi: 'Governance proposals',   target: '12',         unit: 'per year' },
  { kpi: 'ZK solvency proofs',     target: '52',         unit: 'per year' },
  { kpi: 'Network uptime',         target: '99.9%',      unit: 'SLA'      },
];

// ── Scenarios ────────────────────────────────────────────────────────────
const scenarios = [
  {
    emoji: '🐻',
    label: 'Bear',
    color: '#8A9BB5',
    txGrowth: '0.5% monthly',
    swapGrowth: '0.3% monthly',
    yield: '3.0% avg',
    validators: '15 (slow)',
    breakEven: 'Year 3',
  },
  {
    emoji: '📊',
    label: 'Base',
    color: '#7A5CFF',
    txGrowth: '2.0% monthly',
    swapGrowth: '1.5% monthly',
    yield: '5.0% avg',
    validators: '25–50',
    breakEven: 'Year 2',
  },
  {
    emoji: '🚀',
    label: 'Bull',
    color: '#00F0B5',
    txGrowth: '5.0% monthly',
    swapGrowth: '4.0% monthly',
    yield: '8.0% avg',
    validators: '50–100',
    breakEven: 'Year 1',
  },
];

// ── Risk table ────────────────────────────────────────────────────────────
const risks = [
  { risk: 'Adoption slower than Bear', prob: 'Low',       impact: 'High',     mitigation: 'Reserve floor + runway model' },
  { risk: 'Yield strategy failure',    prob: 'Medium',    impact: 'Medium',   mitigation: '65% stable asset floor' },
  { risk: 'Governance capture',        prob: 'Very Low',  impact: 'Critical', mitigation: 'Constitutional invariants' },
  { risk: 'Regulatory action',         prob: 'Medium',    impact: 'High',     mitigation: 'Regulatory framing (incentive redistribution)' },
  { risk: 'Smart contract exploit',    prob: 'Low',       impact: 'Critical', mitigation: 'Formal verification + audit' },
  { risk: 'Validator cartel',          prob: 'Very Low',  impact: 'High',     mitigation: 'Log-normalized stake weight + multi-region quorum' },
  { risk: 'Token price collapse',      prob: 'Medium',    impact: 'Medium',   mitigation: 'Burn mechanism + buyback floor' },
];

// ── Style helpers ─────────────────────────────────────────────────────────
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px',
  color: '#8A9BB5', fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', fontSize: '0.62rem',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'Inter, system-ui, sans-serif',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
  color: '#8A9BB5',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '0.8rem',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

const tdBold: React.CSSProperties = { ...td, color: '#E8EDF5', fontWeight: 600 };

const sectionHeading: React.CSSProperties = {
  fontFamily: 'Orbitron, system-ui, sans-serif',
  fontSize: 'clamp(1rem, 2vw, 1.3rem)',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: '#E8EDF5',
  textTransform: 'uppercase',
  marginBottom: 20,
  marginTop: 0,
};

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  margin: '40px 0',
};

const probColor: Record<string, string> = {
  'Low': '#00F0B5', 'Very Low': '#00F0B5', 'Medium': '#C9A227', 'High': '#FF3B3B',
};

export default function FinancialsPage() {
  return (
    <div style={{ background: '#0B0F14', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <LayerBadge layer="L1" showDot />
            <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.16em', color: '#8A9BB5', textTransform: 'uppercase' }}>
              Financial Model · Institutional Grade · Q1 2026
            </span>
          </div>
          <h1 style={{
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 700,
            letterSpacing: '0.06em', color: '#E8EDF5', textTransform: 'uppercase', marginBottom: 10,
          }}>
            5-Year Financial Projection
          </h1>
          <p style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.88rem', color: '#8A9BB5', maxWidth: 560, margin: '0 0 20px', lineHeight: 1.7 }}>
            GhostStack sovereign economic engine — revenue, treasury, GST supply dynamics, and
            validator economics across three scenarios: Bear, Base, and Bull.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/ghoststack/whitepaper#economics" style={{
              background: 'rgba(122,92,255,0.1)', color: '#7A5CFF',
              padding: '8px 16px', borderRadius: 7,
              fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
              border: '1px solid rgba(122,92,255,0.25)',
            }}>
              Whitepaper §7 →
            </Link>
            <Link href="/tokenomics" style={{
              background: 'rgba(201,162,39,0.1)', color: '#C9A227',
              padding: '8px 16px', borderRadius: 7,
              fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
              border: '1px solid rgba(201,162,39,0.25)',
            }}>
              Live Tokenomics →
            </Link>
            <Link href="/econ/treasury" style={{
              background: 'rgba(0,240,181,0.08)', color: '#00F0B5',
              padding: '8px 16px', borderRadius: 7,
              fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
              border: '1px solid rgba(0,240,181,0.2)',
            }}>
              Treasury Dashboard →
            </Link>
          </div>
        </div>

        {/* ── Scenarios ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Scenario Definitions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {scenarios.map((s) => (
              <div key={s.label} style={{
                background: `rgba(${s.color === '#7A5CFF' ? '122,92,255' : s.color === '#00F0B5' ? '0,240,181' : '138,155,181'},0.06)`,
                border: `1px solid ${s.color}22`,
                borderTop: `3px solid ${s.color}`,
                borderRadius: 10, padding: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: '1.2rem' }}>{s.emoji}</span>
                  <span style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: s.color, letterSpacing: '0.08em' }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { k: 'Monthly tx growth', v: s.txGrowth   },
                    { k: 'Swap growth',         v: s.swapGrowth },
                    { k: 'Yield rate',           v: s.yield      },
                    { k: 'Validators',           v: s.validators },
                    { k: 'Break-even',           v: s.breakEven  },
                  ].map(({ k, v }) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5' }}>{k}</span>
                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: '#E8EDF5' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr style={divider} />

        {/* ── Revenue Trajectory ──────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Revenue Trajectory (5-Year)</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Year / Phase</th>
                  <th style={{ ...th, color: '#8A9BB5' }}>🐻 Bear</th>
                  <th style={{ ...th, color: '#7A5CFF' }}>📊 Base</th>
                  <th style={{ ...th, color: '#00F0B5' }}>🚀 Bull</th>
                </tr>
              </thead>
              <tbody>
                {revenueByYear.map((row) => (
                  <tr key={row.year}>
                    <td style={tdBold}>
                      {row.year}
                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5', marginLeft: 6 }}>({row.phase})</span>
                    </td>
                    <td style={td}>{row.bear}</td>
                    <td style={{ ...td, color: '#7A5CFF', fontWeight: 600 }}>{row.base}</td>
                    <td style={{ ...td, color: '#00F0B5', fontWeight: 600 }}>{row.bull}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid rgba(122,92,255,0.2)' }}>
                  <td style={{ ...tdBold, color: '#C9A227' }}>5Y Total</td>
                  <td style={{ ...td, fontWeight: 700, color: '#E8EDF5' }}>$15.16M</td>
                  <td style={{ ...td, fontWeight: 700, color: '#7A5CFF' }}>$488.03M</td>
                  <td style={{ ...td, fontWeight: 700, color: '#00F0B5' }}>$5.79B</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Treasury Growth ─────────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Treasury Growth</h2>
          <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.82rem', color: '#8A9BB5', marginBottom: 20 }}>
            Constitutional allocation: 20% reserve buffer · 30% validator rewards · 30% ecosystem grants · 20% L2/L3 incentives.
            Reserve floor (20%) maintained at all times per constitutional invariant I-02.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Year</th>
                  <th style={{ ...th, color: '#8A9BB5' }}>🐻 Bear</th>
                  <th style={{ ...th, color: '#7A5CFF' }}>📊 Base</th>
                  <th style={{ ...th, color: '#00F0B5' }}>🚀 Bull</th>
                </tr>
              </thead>
              <tbody>
                {treasuryByYear.map((row) => (
                  <tr key={row.year}>
                    <td style={tdBold}>{row.year}</td>
                    <td style={td}>{row.bear}</td>
                    <td style={{ ...td, color: '#7A5CFF', fontWeight: 600 }}>{row.base}</td>
                    <td style={{ ...td, color: '#00F0B5', fontWeight: 600 }}>{row.bull}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── GST Supply Dynamics ─────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>GST Supply — Cumulative Removed (Burn + Buyback)</h2>
          <div style={{
            background: 'rgba(201,162,39,0.06)', border: '1px solid rgba(201,162,39,0.15)',
            borderRadius: 8, padding: '14px 18px', marginBottom: 20,
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem', color: '#8A9BB5',
          }}>
            <span style={{ color: '#C9A227', fontWeight: 600 }}>S(t) = S₀ − B(t) − R(t) + E(t)</span>
            {'  ·  '}
            Genesis supply: <strong style={{ color: '#E8EDF5' }}>1,000,000,000 GST</strong>
            {'  ·  '}
            Net deflationary across all scenarios (B(t) + R(t) {'>'} E(t)).
            {'  '}
            Bull scenario removes <strong style={{ color: '#C9A227' }}>~1.16% of supply</strong> over 5 years.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Year</th>
                  <th style={{ ...th, color: '#8A9BB5' }}>🐻 Bear (GST)</th>
                  <th style={{ ...th, color: '#7A5CFF' }}>📊 Base (GST)</th>
                  <th style={{ ...th, color: '#00F0B5' }}>🚀 Bull (GST)</th>
                </tr>
              </thead>
              <tbody>
                {gstBurnByYear.map((row, i) => (
                  <tr key={row.year} style={i === gstBurnByYear.length - 1 ? { borderTop: '1px solid rgba(201,162,39,0.2)' } : {}}>
                    <td style={i === gstBurnByYear.length - 1 ? { ...tdBold, color: '#C9A227' } : tdBold}>{row.year}</td>
                    <td style={td}>{row.bear}</td>
                    <td style={{ ...td, color: '#7A5CFF', fontWeight: i === gstBurnByYear.length - 1 ? 700 : 400 }}>{row.base}</td>
                    <td style={{ ...td, color: '#00F0B5', fontWeight: i === gstBurnByYear.length - 1 ? 700 : 400 }}>{row.bull}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ ...sectionHeading, fontSize: '0.9rem', marginTop: 28 }}>Circulating Supply Projection (GST)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Year</th>
                  <th style={{ ...th, color: '#8A9BB5' }}>Bear</th>
                  <th style={{ ...th, color: '#7A5CFF' }}>Base</th>
                  <th style={{ ...th, color: '#00F0B5' }}>Bull</th>
                </tr>
              </thead>
              <tbody>
                {supplyByYear.map((row) => (
                  <tr key={row.year}>
                    <td style={tdBold}>{row.year}</td>
                    <td style={td}>{row.bear}</td>
                    <td style={{ ...td, color: '#7A5CFF' }}>{row.base}</td>
                    <td style={{ ...td, color: '#00F0B5' }}>{row.bull}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Validator Economics ──────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Validator Economics — Base Scenario APY</h2>
          <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.82rem', color: '#8A9BB5', marginBottom: 20 }}>
            APY stabilizes in the 4–6% range as validator count grows — sustainable long-term incentive aligned
            with constitutional governance. Per-validator figure assumes 100K GST stake.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Year', 'Validators', 'Annual Reward Pool', 'Per Validator', 'APY'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validatorApy.map((row) => (
                  <tr key={row.year}>
                    <td style={tdBold}>{row.year}</td>
                    <td style={td}>{row.count}</td>
                    <td style={td}>{row.pool}</td>
                    <td style={td}>{row.perValidator}</td>
                    <td style={{ ...td, color: '#00F0B5', fontWeight: 600 }}>{row.apy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Y1 KPIs ─────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Year 1 KPIs — Base Scenario (2026)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {y1Kpis.map((item) => (
              <div key={item.kpi} style={{
                background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.15)',
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 6 }}>
                  {item.kpi}
                </div>
                <div style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#7A5CFF', marginBottom: 2 }}>
                  {item.target}
                </div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5' }}>
                  {item.unit}
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr style={divider} />

        {/* ── Risk Table ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Risk Factors</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Risk', 'Probability', 'Impact', 'Mitigation'].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.risk}>
                    <td style={tdBold}>{r.risk}</td>
                    <td style={{ ...td, color: probColor[r.prob] || '#8A9BB5', fontWeight: 600 }}>{r.prob}</td>
                    <td style={{ ...td, color: probColor[r.impact] || '#8A9BB5', fontWeight: 600 }}>{r.impact}</td>
                    <td style={td}>{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr style={divider} />

        {/* ── Conclusion ───────────────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={sectionHeading}>Conclusion</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {[
              { point: 'Self-sustaining treasury',    desc: 'By Year 2 (Base/Bull) or Year 3 (Bear)', color: '#00F0B5' },
              { point: 'Net deflationary supply',     desc: 'From Year 1 across all scenarios',        color: '#C9A227' },
              { point: 'Sustainable validator APY',   desc: 'Stabilizes 4–8% long-term',               color: '#7A5CFF' },
              { point: 'Reserve floor maintained',    desc: '20% constitutional floor throughout',     color: '#00C2FF' },
              { point: 'Compounding flywheel',        desc: 'L3 → L2 → L1 → yield → reinvestment',   color: '#00F0B5' },
            ].map((item) => (
              <div key={item.point} style={{
                background: `rgba(${item.color === '#00F0B5' ? '0,240,181' : item.color === '#C9A227' ? '201,162,39' : item.color === '#7A5CFF' ? '122,92,255' : '0,194,255'},0.06)`,
                border: `1px solid ${item.color}22`,
                borderRadius: 8, padding: '16px',
              }}>
                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: item.color, marginBottom: 4 }}>
                  ✓ {item.point}
                </div>
                <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5' }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5', marginTop: 20, lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 16 }}>
            <strong>Disclaimer:</strong> Price assumptions are illustrative only. Actual GST price is market-determined.
            Growth rates are compounded monthly from starting volumes. This model is not a financial guarantee or investment advice.
            All projections derived from the GhostStack GST Tokenomics mathematical model and constitutional allocation rules. v1.0 · Q1 2026
          </p>
        </section>

        {/* ── Navigation ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/ghoststack/whitepaper" style={{ background: 'rgba(122,92,255,0.1)', color: '#7A5CFF', padding: '10px 22px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(122,92,255,0.25)' }}>
            ← Whitepaper
          </Link>
          <Link href="/tokenomics" style={{ background: 'rgba(201,162,39,0.1)', color: '#C9A227', padding: '10px 22px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(201,162,39,0.25)' }}>
            Live Tokenomics
          </Link>
          <Link href="/econ" style={{ background: 'linear-gradient(135deg, #7A5CFF, #5A3CDF)', color: '#E8EDF5', padding: '10px 22px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}>
            Economic Dashboard →
          </Link>
        </div>

      </div>
    </div>
  );
}
