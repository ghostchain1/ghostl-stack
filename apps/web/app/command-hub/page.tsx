'use client';

/**
 * /command-hub — Unified operator dashboard.
 *
 * Four-panel real-time summary: Chain health · Validators · Treasury · AI.
 * Each panel is a self-contained component backed by the global store.
 */

import { ChainStatus }     from '../../src/components/dashboard/ChainStatus';
import { ValidatorStatus } from '../../src/components/dashboard/ValidatorStatus';
import { TreasuryStatus }  from '../../src/components/dashboard/TreasuryStatus';
import { AIAlerts }        from '../../src/components/dashboard/AIAlerts';
import { NetworkTopologyMap } from '../../src/modules/network-map/NetworkTopologyMap';

export default function CommandHubPage() {
  return (
    <div className="content">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Command Hub</h2>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          Real-time overview of GhostChain L1 · GhostL2 · GhostL3 · AI systems
        </p>
      </div>

      {/* Four main status panels */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
          marginBottom: 28,
        }}
      >
        <ChainStatus />
        <ValidatorStatus />
        <TreasuryStatus />
        <AIAlerts />
      </div>

      {/* Network Topology Map */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-title" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #1f2937)' }}>
          Network Topology
        </div>
        <div style={{ padding: 16 }}>
          <NetworkTopologyMap />
        </div>
      </div>
    </div>
  );
}
