'use client';

import { Suspense } from 'react';
import { AIServicesPanel } from './components/AIServicesPanel';
import { InfraStatusPanel } from './components/InfraStatusPanel';
import { MultichainSovereigntyPanel } from './components/MultichainSovereigntyPanel';
import { ChainHealthRow } from './components/ChainHealthRow';
import { NodeStatus } from './components/NodeStatus';
import { ValidatorPanel } from './components/ValidatorPanel';
import { TreasuryPanel } from './components/TreasuryPanel';
import { DeFiPanel } from './components/DeFiPanel';
import { AIControlPanel } from './components/AIControlPanel';

export function CommandCenter() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>GhostStack Command Center</h1>
        <span className="muted" style={{ fontSize: 13 }}>
          L1 · L2 · L3 · AI · Infra · Multichain
        </span>
      </div>

      {/* Chain health strip — L1 / L2 / L3 at a glance */}
      <Suspense fallback={<div className="card muted">Loading chain status…</div>}>
        <ChainHealthRow />
      </Suspense>

      {/* Main grid — 3 columns on large screens, 1 on mobile */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <Suspense fallback={<PanelSkeleton title="Nodes" />}>
          <NodeStatus />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Validators" />}>
          <ValidatorPanel />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Treasury" />}>
          <TreasuryPanel />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="DeFi Systems" />}>
          <DeFiPanel />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="AI Services" />}>
          <AIServicesPanel />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="AI Control" />}>
          <AIControlPanel />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Infrastructure" />}>
          <InfraStatusPanel />
        </Suspense>

        <Suspense fallback={<PanelSkeleton title="Multichain" />}>
          <MultichainSovereigntyPanel />
        </Suspense>
      </div>
    </div>
  );
}

function PanelSkeleton({ title }: { title: string }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13 }}>Loading…</div>
    </div>
  );
}
