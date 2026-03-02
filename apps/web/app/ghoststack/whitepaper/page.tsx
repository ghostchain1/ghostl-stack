import type { Metadata } from 'next';
import Link from 'next/link';
import { GhostWordmark } from '@/components/brand/GhostMark';
import { LayerBadge } from '@/components/brand/LayerBadge';

export const metadata: Metadata = {
  title: 'GhostStack Whitepaper — Autonomy Secured.',
  description:
    'GhostStack Whitepaper v1.0 — AI-governed sovereign multichain federation. Constitutional governance, energy-efficient consensus, and long-horizon digital sovereignty.',
};

// ── Table of contents ────────────────────────────────────────────────────
const toc = [
  { id: 'abstract',       label: 'Abstract'                                           },
  { id: 'exec-summary',   label: '1. Executive Summary'                              },
  { id: 'problems',       label: '2. Structural Failures'                            },
  { id: 'thesis',         label: '3. Layered Sovereignty Thesis'                     },
  { id: 'architecture',   label: '4. System Architecture'                            },
  { id: 'ai',             label: '5. Hyper Ghost AI Governance'                      },
  { id: 'constitution',   label: '6. Constitutional Enforcement'                      },
  { id: 'economics',      label: '7. Economic Model — GST'                           },
  { id: 'federation',     label: '8. Federation Model'                               },
  { id: 'energy',         label: '9. Energy Efficiency'                              },
  { id: 'security',       label: '10. Security Architecture'                         },
  { id: 'roadmap',        label: '11. Roadmap'                                       },
  { id: 'regulatory',     label: '12. Regulatory Alignment'                          },
  { id: 'conclusion',     label: '13. Conclusion'                                    },
];

// ── Problem data ─────────────────────────────────────────────────────────
const problems = [
  { id: '2.1', title: 'Gas Volatility',           impact: '10,000%+ gas spike during peak demand events on major chains.' },
  { id: '2.2', title: 'Fragmented Liquidity',     impact: '$2.5B+ lost to bridge exploits. 0.3–2% additional slippage per transaction.' },
  { id: '2.3', title: 'Governance Capture',       impact: 'Hundreds of millions lost to governance attacks. Chronic quorum failures.' },
  { id: '2.4', title: 'Validator Misalignment',   impact: 'Narrow slashing conditions. Validator cartels without constitutional consequence.' },
  { id: '2.5', title: 'Energy Inefficiency',      impact: 'Validators run at full capacity regardless of load. Conservative gas targets waste compute.' },
];

// ── AI subsystems ────────────────────────────────────────────────────────
const aiSystems = [
  { name: 'GhostLoad AI',   layer: 'AI' as const, role: 'Gas Optimization & Load Balancing',      desc: 'Continuously models demand curves and adjusts gas targets before congestion occurs. Rebalances validator load across regions.' },
  { name: 'GhostDNS AI',    layer: 'AI' as const, role: 'Network Intelligence & Routing',          desc: 'Intelligent peer routing and DNS resolution. Maintains federation mesh topology with adaptive failover.' },
  { name: 'Treasury AI',    layer: 'AI' as const, role: 'Capital Allocation & Yield Optimization', desc: 'Risk-scores external strategies. Executes buyback and burn operations. Enforces constitutional allocation bounds.' },
  { name: 'GhostSentinel',  layer: 'SEC' as const, role: 'AI Threat Detection & Security',          desc: 'Continuous on-chain monitoring. Anomaly detection. Quarantine triggers for malicious validator behavior.' },
];

// ── Constitutional invariants ─────────────────────────────────────────────
const invariants = [
  { id: 'I-01', label: 'Routing Law',           desc: 'L3 → L2 → L1 only. L3 → L1 direct is FORBIDDEN. Enforced at contract level.' },
  { id: 'I-02', label: 'Reserve Floor',         desc: 'Treasury reserve ≥ 20% of holdings at all times. Withdrawals blocked if floor violated.' },
  { id: 'I-03', label: 'No EOA Authority',       desc: 'No externally owned account holds unilateral authority over treasury, governance, or contracts.' },
  { id: 'I-04', label: 'Governance Timelock',   desc: 'All upgrades require timelock + multi-sig quorum. Emergency pause requires GUARDIAN_ROLE.' },
  { id: 'I-05', label: 'Policy Ambiguity Closes', desc: 'Undefined policy states fail closed. No open-ended emergency withdrawal path.' },
  { id: 'I-06', label: 'AI Boundary Enforcement', desc: 'AI authority is governance-locked. AI cannot exceed its delegated scope unilaterally.' },
];

// ── GST token roles ──────────────────────────────────────────────────────
const gstRoles = [
  { role: 'Gas',       layer: 'L1, L2, L3', function: 'Transaction fee payment across all layers' },
  { role: 'Governance', layer: 'L1',        function: 'Voting weight for constitutional proposals' },
  { role: 'Staking',   layer: 'L1',         function: 'Validator collateral and delegation' },
  { role: 'Burn',      layer: 'All',        function: 'Deflationary mechanism — 2% base burn rate per epoch' },
  { role: 'Buyback',   layer: 'L1',         function: 'Treasury yield → GST buyback and burn (15% of net yield)' },
];

// ── Federation entities ───────────────────────────────────────────────────
const federationEntities = [
  { name: 'GhostStack Foundation',         role: 'Constitutional Oversight & Governance Ratification' },
  { name: 'GhostStack Labs',               role: 'AI Research & Protocol R&D' },
  { name: 'GhostStack Treasury Authority', role: 'Economic Stability & Allocation Governance' },
  { name: 'Ghost Federation Council',      role: 'Validator Coordination & Slashing Governance' },
  { name: 'Ghost Sovereign Network',       role: 'Global Node Infrastructure' },
];

// ── Shared styles ────────────────────────────────────────────────────────
const heading2: React.CSSProperties = {
  fontFamily: 'Orbitron, system-ui, sans-serif',
  fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: '#E8EDF5',
  textTransform: 'uppercase',
  marginBottom: 20,
  marginTop: 0,
};

const heading3: React.CSSProperties = {
  fontFamily: 'Sora, system-ui, sans-serif',
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#E8EDF5',
  marginBottom: 10,
  marginTop: 0,
};

const body: React.CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '0.85rem',
  color: '#8A9BB5',
  lineHeight: 1.75,
  marginBottom: 16,
};

const sectionWrap: React.CSSProperties = {
  marginBottom: 72,
  scrollMarginTop: 80,
};

const inlineCode: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: '0.78rem',
  background: 'rgba(122,92,255,0.12)',
  color: '#7A5CFF',
  padding: '2px 6px',
  borderRadius: 4,
};

const divider: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  margin: '48px 0',
};

export default function WhitepaperPage() {
  return (
    <div style={{ background: '#0B0F14', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Sticky Nav ──────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(11,15,20,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(122,92,255,0.12)',
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/ghoststack" style={{ textDecoration: 'none' }}>
            <GhostWordmark size={24} />
          </Link>
          <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', color: '#8A9BB5', textTransform: 'uppercase' }}>
            / Whitepaper v1.0
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/econ/financials" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.75rem', color: '#8A9BB5', textDecoration: 'none' }}>
            Financial Model →
          </Link>
          <Link href="/econ" style={{
            background: 'linear-gradient(135deg, #7A5CFF, #5A3CDF)',
            color: '#E8EDF5', padding: '7px 16px', borderRadius: 8,
            fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
          }}>
            Launch App
          </Link>
        </div>
      </nav>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>

        {/* ── Sidebar TOC ──────────────────────────────────────────────── */}
        <aside style={{
          width: 220, flexShrink: 0, marginRight: 48,
          position: 'sticky', top: 80, alignSelf: 'flex-start',
          display: 'none', /* hidden on mobile, shown via media query workaround */
        }}>
          <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.16em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 14 }}>
            Contents
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {toc.map((item) => (
              <a key={item.id} href={`#${item.id}`} style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '0.75rem', color: '#8A9BB5', textDecoration: 'none',
                padding: '4px 0',
                borderLeft: '2px solid rgba(122,92,255,0.15)',
                paddingLeft: 10,
                transition: 'color 0.15s',
              }}>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <main style={{ flex: 1, minWidth: 0 }}>

          {/* Header */}
          <div style={{ marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{
                fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', fontWeight: 600,
                letterSpacing: '0.14em', color: '#7A5CFF', textTransform: 'uppercase',
                background: 'rgba(122,92,255,0.1)', padding: '3px 10px',
                border: '1px solid rgba(122,92,255,0.25)', borderRadius: 999,
              }}>
                Whitepaper v1.0
              </span>
              <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', color: '#8A9BB5' }}>
                Public — Institutional Grade · March 2026
              </span>
            </div>
            <h1 style={{
              fontFamily: 'Orbitron, system-ui, sans-serif',
              fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 700,
              letterSpacing: '0.06em', color: '#E8EDF5',
              textTransform: 'uppercase', marginBottom: 12,
            }}>
              GhostStack
            </h1>
            <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1.1rem', color: '#7A5CFF', marginBottom: 20 }}>
              Autonomous Sovereign Multichain Federation
            </div>
            <blockquote style={{
              fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem',
              color: '#8A9BB5', fontStyle: 'italic',
              borderLeft: '3px solid rgba(122,92,255,0.4)', paddingLeft: 16, margin: '0 0 24px',
            }}>
              "Governance is code. Intelligence is enforced. Sovereignty is engineered."
            </blockquote>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['L1', 'L2', 'L3', 'AI', 'SEC'] as const).map((l) => (
                <LayerBadge key={l} layer={l} showDot />
              ))}
            </div>
          </div>

          <hr style={divider} />

          {/* ── Abstract ─────────────────────────────────────────────── */}
          <section id="abstract" style={sectionWrap}>
            <h2 style={heading2}>Abstract</h2>
            <p style={body}>
              GhostStack is a vertically integrated, AI-governed, constitutionally enforced multichain federation
              designed for the autonomous era of digital infrastructure. It comprises three execution layers —
              GhostL3 (utility), GhostL2 (liquidity), and GhostChain L1 (sovereign settlement) — governed by a
              constitutional smart contract framework, coordinated by Hyper Ghost AI, and sustained by a
              closed-loop sovereign economic engine.
            </p>
            <p style={body}>
              This whitepaper presents the architectural thesis, economic model, governance doctrine, security
              framework, and federation strategy of GhostStack. It is intended for institutional investors,
              protocol engineers, governance researchers, and sovereign infrastructure architects.
            </p>
          </section>

          <hr style={divider} />

          {/* ── 1. Executive Summary ────────────────────────────────── */}
          <section id="exec-summary" style={sectionWrap}>
            <h2 style={heading2}>1. Executive Summary</h2>

            <h3 style={heading3}>1.1 The Autonomous Infrastructure Thesis</h3>
            <p style={body}>
              The next decade of digital infrastructure will be defined not by which chains have the most users
              today, but by which systems are architecturally prepared for AI-coordinated, constitutionally
              governed, sovereign-scale operation.
            </p>
            <p style={body}>
              AI systems are becoming capable of governing complex economic systems with greater precision, speed,
              and consistency than human committees. Institutional actors — sovereign wealth funds, nation-states,
              large DAOs, and regulated financial entities — require infrastructure that is constitutionally
              enforceable, not merely socially agreed upon. GhostStack is designed for this world. Not adapted
              to it after the fact — designed for it from genesis.
            </p>

            <h3 style={heading3}>1.2 The Failure of Reactive Governance</h3>
            <p style={body}>
              The history of blockchain governance is a history of reactive design: governance added after launch
              as an afterthought, treasury controlled by multisigs rather than invariants, AI as a marketing layer
              rather than a protocol primitive, security audited once rather than enforced continuously. The result:
              governance capture, treasury exploits, validator cartels, gas volatility, and fragmented liquidity —
              repeated across every major chain generation.
            </p>

            <h3 style={heading3}>1.3 AI-Governed Constitutional Multichain Design</h3>
            <p style={body}>
              GhostStack's core architectural insight: <strong style={{ color: '#E8EDF5' }}>AI and constitutional
              governance are not in tension — they are complementary.</strong> Constitutional invariants define the
              boundaries of what is permissible. AI operates with maximum efficiency within those boundaries.
              Governance ratifies changes to the boundaries.
            </p>
            <div style={{
              background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.2)',
              borderRadius: 10, padding: '20px 24px', marginBottom: 20,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Autonomous',    desc: 'AI coordinates without human bottlenecks', color: '#00F0B5' },
                  { label: 'Constitutional', desc: 'Invariants prevent AI exceeding its authority', color: '#C9A227' },
                  { label: 'Evolvable',     desc: 'Governance ratifies changes through defined processes', color: '#7A5CFF' },
                  { label: 'Auditable',     desc: 'Every action produces court-ready cryptographic evidence', color: '#00C2FF' },
                ].map((p) => (
                  <div key={p.label}>
                    <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: p.color, marginBottom: 4 }}>{p.label}</div>
                    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5' }}>{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <blockquote style={{ borderLeft: '3px solid rgba(0,240,181,0.4)', paddingLeft: 16, margin: 0 }}>
              <p style={{ ...body, margin: 0, color: '#E8EDF5', fontStyle: 'italic' }}>
                "This is the GhostStack thesis: <strong>Autonomy Secured.</strong>"
              </p>
            </blockquote>
          </section>

          <hr style={divider} />

          {/* ── 2. Problems ──────────────────────────────────────────── */}
          <section id="problems" style={sectionWrap}>
            <h2 style={heading2}>2. Structural Failures of Current Infrastructure</h2>
            <p style={body}>
              Each failure listed below is not a market edge case — it is a predictable outcome of architectural
              choices that prioritize short-term deployment speed over long-term constitutional resilience.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {problems.map((p) => (
                <div key={p.id} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '18px 20px',
                }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'baseline' }}>
                    <span style={inlineCode}>§{p.id}</span>
                    <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#E8EDF5' }}>{p.title}</span>
                  </div>
                  <p style={{ ...body, margin: 0, color: '#FF3B3B', fontSize: '0.78rem' }}>
                    <strong>Quantified Impact:</strong> {p.impact}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <hr style={divider} />

          {/* ── 3. Thesis ────────────────────────────────────────────── */}
          <section id="thesis" style={sectionWrap}>
            <h2 style={heading2}>3. The GhostStack Thesis: Layered Sovereignty</h2>
            <p style={body}>
              GhostStack's architectural response to each structural failure is a first-class constitutional
              primitive. Every system that has historically been reactive is, in GhostStack, enforced from genesis.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 600, margin: '0 auto 32px' }}>
              {[
                { layer: 'L3' as const, name: 'GhostL3',    role: 'Utility & Application Layer',    desc: 'SDKs · dApps · NFTs · Payments · Streaming · APIs', color: '#00C2FF', bg: 'rgba(0,194,255,0.06)' },
                { layer: 'L2' as const, name: 'GhostL2',    role: 'Liquidity & Exchange Layer',      desc: 'GhostXchange · Pools · Launchpad · Bridges',         color: '#7A5CFF', bg: 'rgba(122,92,255,0.06)' },
                { layer: 'L1' as const, name: 'GhostChain', role: 'Sovereign Settlement & Treasury', desc: 'Governor · TreasuryVault · AllocationScheduler',      color: '#C9A227', bg: 'rgba(201,162,39,0.06)' },
              ].map((item, i) => (
                <div key={item.layer}>
                  <div style={{ background: item.bg, border: `1px solid ${item.color}33`, borderRadius: 10, padding: '16px 20px', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: item.color, borderRadius: '10px 0 0 10px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <LayerBadge layer={item.layer} showDot />
                      <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: item.color }}>{item.name}</span>
                      <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.7rem', color: '#8A9BB5' }}>— {item.role}</span>
                    </div>
                    <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5', margin: 0 }}>{item.desc}</p>
                  </div>
                  {i < 2 && <div style={{ textAlign: 'center', padding: '4px 0', color: '#7A5CFF', fontWeight: 700 }}>↓</div>}
                </div>
              ))}
            </div>
            <p style={body}>
              <strong style={{ color: '#E8EDF5' }}>Routing Law:</strong> L3 → L2 only. L2 → L1 only.
              L3 → L1 direct is <strong style={{ color: '#FF3B3B' }}>FORBIDDEN</strong> and enforced at the
              contract level. This invariant is non-negotiable and cannot be overridden by governance vote.
            </p>
          </section>

          <hr style={divider} />

          {/* ── 5. AI Governance ─────────────────────────────────────── */}
          <section id="ai" style={sectionWrap}>
            <h2 style={heading2}>5. Hyper Ghost AI Governance Layer</h2>
            <p style={body}>
              Hyper Ghost AI operates as a first-class protocol participant with governance-locked authority
              boundaries. It is not an external tool — it is a protocol primitive present from genesis and
              referenced by constitutional contracts.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {aiSystems.map((sys) => (
                <div key={sys.name} style={{
                  background: sys.layer === 'SEC' ? 'rgba(255,59,59,0.05)' : 'rgba(0,240,181,0.05)',
                  border: `1px solid ${sys.layer === 'SEC' ? 'rgba(255,59,59,0.2)' : 'rgba(0,240,181,0.2)'}`,
                  borderRadius: 10, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <LayerBadge layer={sys.layer} showDot />
                    <span style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.85rem', fontWeight: 700, color: sys.layer === 'SEC' ? '#FF3B3B' : '#00F0B5' }}>{sys.name}</span>
                  </div>
                  <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color: '#8A9BB5', textTransform: 'uppercase', marginBottom: 8 }}>
                    {sys.role}
                  </div>
                  <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.75rem', color: '#8A9BB5', lineHeight: 1.6, margin: 0 }}>{sys.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <hr style={divider} />

          {/* ── 6. Constitutional Enforcement ────────────────────────── */}
          <section id="constitution" style={sectionWrap}>
            <h2 style={heading2}>6. Constitutional Enforcement Framework</h2>
            <p style={body}>
              Constitutional invariants are enforced at the smart contract level. They define the boundary
              within which governance operates. No governance vote can remove constitutional protections,
              bypass treasury invariants, or grant unilateral authority to any actor.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invariants.map((inv) => (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  background: 'rgba(201,162,39,0.05)', border: '1px solid rgba(201,162,39,0.15)',
                  borderRadius: 8, padding: '14px 16px',
                }}>
                  <span style={inlineCode}>{inv.id}</span>
                  <div>
                    <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: '#C9A227', marginBottom: 4 }}>{inv.label}</div>
                    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.75rem', color: '#8A9BB5' }}>{inv.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <hr style={divider} />

          {/* ── 7. Economic Model ────────────────────────────────────── */}
          <section id="economics" style={sectionWrap}>
            <h2 style={heading2}>7. Economic Model — $GST</h2>
            <p style={body}>
              The Ghost Sovereign Token (GST) is the native multi-function utility token of the GhostStack
              federation. Genesis supply: <span style={inlineCode}>1,000,000,000 GST</span> (1 billion).
              Decimals: <span style={inlineCode}>18</span>.
            </p>

            <h3 style={heading3}>Supply Dynamics</h3>
            <div style={{
              background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.15)',
              borderRadius: 8, padding: '16px 20px', marginBottom: 20,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.78rem', color: '#8A9BB5',
            }}>
              <div style={{ color: '#00F0B5', marginBottom: 8 }}>S(t) = S₀ - B(t) - R(t) + E(t)</div>
              <div style={{ paddingLeft: 16, lineHeight: 1.8 }}>
                <div>S₀ = 1,000,000,000 GST (genesis)</div>
                <div>B(t) = cumulative protocol fee burn</div>
                <div>R(t) = cumulative buyback-and-burn</div>
                <div>E(t) = cumulative validator emission</div>
              </div>
              <div style={{ marginTop: 8, color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem' }}>
                Design principle: B(t) + R(t) {'>'} E(t) over the long run — net deflationary.
              </div>
            </div>

            <h3 style={heading3}>Burn Algorithm</h3>
            <p style={body}>
              Each epoch, burn is computed as <span style={inlineCode}>B(e) = F(e) × r_burn(e)</span> where
              the base burn rate is <span style={inlineCode}>r_base = 2.0%</span>. The rate adapts to network
              utilization above a 50% threshold with sensitivity coefficient κ = 0.10. Governance may adjust
              κ within [0.05, 0.20] via standard majority.
            </p>

            <h3 style={heading3}>Token Roles</h3>
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Role', 'Layer', 'Function'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#8A9BB5', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gstRoles.map((r) => (
                    <tr key={r.role} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px', color: '#C9A227', fontWeight: 600 }}>{r.role}</td>
                      <td style={{ padding: '10px 12px', color: '#8A9BB5' }}>{r.layer}</td>
                      <td style={{ padding: '10px 12px', color: '#8A9BB5' }}>{r.function}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/tokenomics" style={{
                background: 'rgba(201,162,39,0.1)', color: '#C9A227',
                padding: '10px 20px', borderRadius: 8,
                fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
                border: '1px solid rgba(201,162,39,0.3)',
              }}>
                Live Tokenomics Dashboard →
              </Link>
              <Link href="/econ/financials" style={{
                background: 'rgba(122,92,255,0.1)', color: '#7A5CFF',
                padding: '10px 20px', borderRadius: 8,
                fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
                border: '1px solid rgba(122,92,255,0.3)',
              }}>
                5-Year Financial Model →
              </Link>
            </div>
          </section>

          <hr style={divider} />

          {/* ── 8. Federation ────────────────────────────────────────── */}
          <section id="federation" style={sectionWrap}>
            <h2 style={heading2}>8. Federation Model</h2>
            <p style={body}>
              The Ghost Federation is a sovereign digital nation-state architecture governed by five
              constitutional entities, each with enumerated powers and no overlap of unilateral authority.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {federationEntities.map((entity) => (
                <div key={entity.name} style={{
                  background: 'rgba(122,92,255,0.05)', border: '1px solid rgba(122,92,255,0.15)',
                  borderRadius: 8, padding: '14px 16px',
                }}>
                  <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: '#7A5CFF', marginBottom: 4 }}>{entity.name}</div>
                  <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.72rem', color: '#8A9BB5' }}>{entity.role}</div>
                </div>
              ))}
            </div>
          </section>

          <hr style={divider} />

          {/* ── 13. Conclusion ───────────────────────────────────────── */}
          <section id="conclusion" style={sectionWrap}>
            <h2 style={heading2}>13. Conclusion</h2>
            <p style={body}>
              GhostStack is not a response to the problems of today's blockchain systems.
              It is an architecture designed for a world where those problems are recognized as avoidable —
              and avoided from genesis.
            </p>
            <p style={body}>
              The combination of constitutional enforcement, AI-governed operations, layered sovereignty,
              and closed-loop economics creates a system with properties no reactive chain can acquire
              retroactively: invariant-enforced governance, AI-native coordination, and self-compounding
              treasury sovereignty.
            </p>
            <blockquote style={{ borderLeft: '3px solid rgba(122,92,255,0.5)', paddingLeft: 16, margin: '24px 0 0' }}>
              <p style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.1em', color: '#E8EDF5', margin: 0, textTransform: 'uppercase' }}>
                Governance is code. Intelligence is enforced. Sovereignty is engineered.
              </p>
            </blockquote>
          </section>

          {/* ── CTA ──────────────────────────────────────────────────── */}
          <div style={{
            background: 'rgba(122,92,255,0.06)', border: '1px solid rgba(122,92,255,0.2)',
            borderRadius: 12, padding: '32px', textAlign: 'center', marginTop: 32,
          }}>
            <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontSize: '1rem', fontWeight: 700, color: '#E8EDF5', marginBottom: 12 }}>
              Join the Ghost Federation
            </div>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.82rem', color: '#8A9BB5', marginBottom: 20 }}>
              The autonomous infrastructure era is being built.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/econ" style={{
                background: 'linear-gradient(135deg, #7A5CFF, #5A3CDF)',
                color: '#E8EDF5', padding: '12px 28px', borderRadius: 8,
                fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
              }}>
                Open Dashboard
              </Link>
              <Link href="/econ/financials" style={{
                background: 'rgba(201,162,39,0.1)', color: '#C9A227',
                padding: '12px 28px', borderRadius: 8,
                fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
                border: '1px solid rgba(201,162,39,0.3)',
              }}>
                Financial Model
              </Link>
              <Link href="/ghoststack" style={{
                background: 'rgba(255,255,255,0.04)', color: '#8A9BB5',
                padding: '12px 28px', borderRadius: 8,
                fontSize: '0.82rem', fontWeight: 600, letterSpacing: '0.06em', textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                ← Back to Overview
              </Link>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
