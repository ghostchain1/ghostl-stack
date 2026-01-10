'use client';

import { TreasuryApprovals } from '../../src/modules/treasury/TreasuryApprovals';

export default function TreasuryPage() {
  return (
    <div className="content">
      <div className="card-grid">
        <TreasuryApprovals />
      </div>
    </div>
  );
}
