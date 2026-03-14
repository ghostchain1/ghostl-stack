'use client';

import { TreasuryApprovals } from '../../src/modules/treasury/TreasuryApprovals';
import { SovereignEngineDashboard } from '../../src/modules/treasury/SovereignEngineDashboard';
import { TreasuryIntelligence } from '../../src/modules/treasury/components/TreasuryIntelligence';

export default function TreasuryPage() {
  return (
    <div className="content">
      <div className="card-grid">
        <SovereignEngineDashboard />
        <TreasuryApprovals />
        <TreasuryIntelligence />
      </div>
    </div>
  );
}
