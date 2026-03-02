import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNav, PublicFooter } from '../_components/PublicNav';

export const metadata: Metadata = {
  title: 'For Developers — GhostStack',
  description: 'Build on GhostStack: EVM-compatible L3 deployment, AI tooling, constitutional governance APIs, and a complete sovereign chain SDK.',
};

const S = {
  page:    { background: '#070B10', minHeight: '100vh', color: '#E8EDF5', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  section: { maxWidth: 1100, margin: '0 auto', padding: 'clamp(64px,9vw,100px) clamp(16px,4vw,48px)' } as React.CSSProperties,
  cap:     { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', color: '#00C2FF', textTransform: 'uppercase' as const, marginBottom: 10 } as React.CSSProperties,
  h2:      { fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.3rem,2.8vw,1.9rem)', fontWeight: 700, letterSpacing: '0.06em', color: '#E8EDF5', textTransform: 'uppercase' as const, marginBottom: 14, marginTop: 0 } as React.CSSProperties,
  body:    { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.85rem', color: '#8A9BB5', lineHeight: 1.75 } as React.CSSProperties,
  mono:    { fontFamily: 'JetBrains Mono, monospace' } as React.CSSProperties,
};

const capabilities = [
  { id: 'L3-DEP', color: '#00C2FF', title: 'GhostL3 Deployment',       body: 'Spin up a sovereign EVM-compatible L3 in minutes. Configurable rollup parameters, custom gas tokens, and AI-governed sequencer selection.' },
  { id: 'AI-API', color: '#00F0B5', title: 'AI Governance APIs',        body: 'Hook into GhostContractAI endpoints for real-time risk scoring, policy gate checks, and AI-attested upgrade proposals (EIP-712).' },
  { id: 'SDK-TS', color: '#7A5CFF', title: 'TypeScript SDK',            body: 'Full-featured SDK targeting NodeNext ESM. Covers wallet abstraction, bridge operations, staking, governance, and telemetry — typed end-to-end.' },
  { id: 'BRIDGE', color: '#C9A227', title: 'Cross-Chain Bridge SDK',    body: 'L3→L2→L1 message passing and asset bridging API. Routing Law enforced at SDK level — direct L3→L1 routes are compile-time errors.' },
  { id: 'GRAPH',  color: '#00C2FF', title: 'Subgraph & Indexer',        body: 'GhostGraph: pre-built subgraphs for token transfers, governance events, treasury operations, and AI attestations. GraphQL + REST.' },
  { id: 'CONST',  color: '#FF3B3B', title: 'Constitutional Contract Kit',body: 'Audited base contracts for deploying GhostRegistry, GhostPolicyGate, and GhostRiskOracle on any compatible L2/L3 with one command.' },
];

const stack = [
  { label: 'EVM Version',      value: 'Shanghai (EIP-4844 ready)',  color: '#00C2FF' },
  { label: 'Sol Version',      value: 'Solidity 0.8.24',           color: '#7A5CFF' },
  { label: 'TS Runtime',       value: 'Node >=22.21.0 <23',        color: '#00F0B5' },
  { label: 'Module System',    value: 'ESM NodeNext',              color: '#7A5CFF' },
  { label: 'Package Manager',  value: 'pnpm workspaces',           color: '#C9A227' },
  { label: 'Test Framework',   value: 'Foundry + Vitest',          color: '#00C2FF' },
  { label: 'Lint / Format',    value: 'ESLint + Prettier',         color: '#8A9BB5' },
  { label: 'Protocol',         value: 'JSON-RPC 2.0 + REST',       color: '#00F0B5' },
];

const snippets = [
  {
    title: 'Deploy an L3 Chain',
    lang: 'typescript',
    code: `import { GhostL3Factory } from '@ghost/sdk';

const l3 = await GhostL3Factory.create({
  name: 'my-sovereign-chain',
  gasToken: 'GST',
  sequencerMode: 'ai-governed',
  constitutionHash: '0xabc...',
});
console.log('Chain ID:', l3.chainId);`,
  },
  {
    title: 'Policy Gate Check',
    lang: 'typescript',
    code: `import { GhostPolicyGate } from '@ghost/sdk';

const gate = new GhostPolicyGate(POLICY_GATE_ADDRESS);
const result = await gate.check({
  action: 'UPGRADE',
  policyHash: computedHash,
  attestation: riskOracle.attest(upgradePayload),
});
if (!result.allowed) throw new Error(result.reason);`,
  },
];

const quickStart = [
  { step: '01', color: '#00C2FF', title: 'Install SDK',           code: 'pnpm add @ghost/sdk @ghost/contracts' },
  { step: '02', color: '#7A5CFF', title: 'Configure Environment', code: 'export GHOSTAI_REGISTRY_ADDRESS=0x...\nexport GHOSTAI_GOVERNOR_ADDRESS=0x...' },
  { step: '03', color: '#00F0B5', title: 'Run the Dev Stack',     code: 'pnpm dev:stack # starts L1+L2+L3+AI locally' },
  { step: '04', color: '#C9A227', title: 'Deploy Contracts',      code: 'forge script scripts/Deploy.s.sol --network ghostdev' },
];

export default function DevelopersPage() {
  return (
    <div style={S.page}>
      <PublicNav />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(0,194,255,0.08)' }}>
        <div className="gs-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 70% -10%, rgba(0,194,255,0.08) 0%, transparent 55%)', pointerEvents: 'none' }} />
        <div style={{ ...S.section, paddingTop: 'clamp(72px,10vw,108px)', paddingBottom: 56, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <span className="gs-dot-blue" style={{ width: 7, height: 7, borderRadius: '50%', background: '#00C2FF', display: 'inline-block' }} />
            <span style={{ ...S.mono, fontSize: '0.6rem', fontWeight: 700, color: '#00C2FF', letterSpacing: '0.18em' }}>DEV PORTAL · L3 READY · EVM COMPATIBLE · ESM</span>
          </div>
          <h1 style={{ fontFamily: 'Orbitron, system-ui, sans-serif', fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 700, letterSpacing: '0.04em', color: '#E8EDF5', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 20 }}>
            Build Sovereign Apps.<br /><span style={{ color: '#00C2FF' }}>Governed by AI.</span>
          </h1>
          <p style={{ ...S.body, maxWidth: 560, fontSize: '0.95rem', marginBottom: 32 }}>
            GhostStack provides a complete EVM-compatible developer platform with AI governance APIs,
            L3 deployment tooling, TypeScript SDK, and constitutional contract kits — all production-ready.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="#quickstart" style={{ background: 'linear-gradient(135deg, #00C2FF, #007ab5)', color: '#070B10', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>Quick Start ↓</a>
            <Link href="/site/whitepaper" style={{ background: 'rgba(0,194,255,0.07)', color: '#00C2FF', padding: '11px 24px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(0,194,255,0.2)' }}>Architecture Docs</Link>
          </div>
        </div>
      </section>

      {/* Stack Info Strip */}
      <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px clamp(16px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {stack.map((s) => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 7, padding: '10px 12px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${s.color}50, transparent)` }} />
              <div style={{ ...S.mono, fontSize: '0.7rem', fontWeight: 700, color: s.color, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</div>
              <div style={{ ...S.mono, fontSize: '0.52rem', color: '#4A5568', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <section id="quickstart" style={{ ...S.section }}>
        <p style={S.cap}>Quick Start</p>
        <h2 style={S.h2}>Zero to Sovereign in Four Steps.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 10, marginBottom: 32 }}>
          {quickStart.map((q) => (
            <div key={q.step} className="gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${q.color}, transparent)` }} />
              <div style={{ ...S.mono, fontSize: '1.6rem', fontWeight: 700, color: `${q.color}25`, marginBottom: 10 }}>{q.step}</div>
              <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, color: '#E8EDF5', marginBottom: 10, fontSize: '0.88rem' }}>{q.title}</div>
              <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '10px 12px' }}>
                <pre style={{ ...S.mono, fontSize: '0.68rem', color: q.color, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{q.code}</pre>
              </div>
            </div>
          ))}
        </div>

        {/* Code Snippets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px,1fr))', gap: 12 }}>
          {snippets.map((s) => (
            <div key={s.title} className="gs-hud" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0,194,255,0.15)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: 'rgba(0,194,255,0.05)', borderBottom: '1px solid rgba(0,194,255,0.12)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF3B3B', display: 'inline-block' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9A227', display: 'inline-block' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00F0B5', display: 'inline-block' }} />
                <span style={{ ...S.mono, fontSize: '0.62rem', color: '#8A9BB5', marginLeft: 8 }}>{s.title}</span>
              </div>
              <pre style={{ ...S.mono, fontSize: '0.72rem', color: '#00C2FF', margin: 0, padding: '16px', lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{s.code}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ ...S.section }}>
          <p style={S.cap}>Developer Capabilities</p>
          <h2 style={S.h2}>Full-Stack Sovereign Infrastructure.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 12 }}>
            {capabilities.map((c) => (
              <div key={c.id} className="gs-hud gs-card-hover" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c.color}, transparent)` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ ...S.mono, fontSize: '0.58rem', fontWeight: 700, color: c.color, background: `${c.color}12`, border: `1px solid ${c.color}25`, padding: '3px 9px', borderRadius: 4, letterSpacing: '0.1em' }}>{c.id}</span>
                </div>
                <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, color: '#E8EDF5', marginBottom: 8, fontSize: '0.88rem' }}>{c.title}</div>
                <p style={{ ...S.body, margin: 0, fontSize: '0.78rem' }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Routing Law Callout */}
      <section style={{ ...S.section }}>
        <div style={{ background: 'rgba(255,59,59,0.04)', border: '1px solid rgba(255,59,59,0.2)', borderRadius: 12, padding: '24px 28px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ ...S.mono, fontSize: '1.4rem', color: '#FF3B3B', flexShrink: 0 }}>⚠</div>
          <div>
            <div style={{ ...S.cap, color: '#FF3B3B', marginBottom: 8 }}>Invariant I-01 · Routing Law</div>
            <div style={{ fontFamily: 'Sora, system-ui, sans-serif', fontWeight: 700, color: '#E8EDF5', marginBottom: 8 }}>L3 → L2 only. L2 → L1 only. L3 → L1 direct: FORBIDDEN.</div>
            <p style={{ ...S.body, margin: 0, fontSize: '0.8rem' }}>
              This invariant is enforced at SDK level (compile-time error), contract level (on-chain revert), and CI level (routing-law job).
              Any change that bypasses it will be rejected at all three layers. See AGENTS.md §1 for full specification.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...S.section, textAlign: 'center' }}>
        <p style={S.cap}>Start Building</p>
        <h2 style={{ ...S.h2, fontSize: 'clamp(1.4rem,3vw,2.2rem)' }}>The Sovereign Stack is Open to Builders.</h2>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 28 }}>
          <Link href="/site/whitepaper" style={{ background: 'linear-gradient(135deg, #00C2FF, #007ab5)', color: '#070B10', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>Architecture Docs</Link>
          <Link href="/site/users" style={{ background: 'rgba(0,194,255,0.07)', color: '#00C2FF', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(0,194,255,0.2)' }}>User Products</Link>
          <Link href="/site" style={{ background: 'rgba(255,255,255,0.04)', color: '#8A9BB5', padding: '12px 28px', borderRadius: 9, fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.08)' }}>Back to Overview</Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
