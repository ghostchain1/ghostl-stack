import type { ReactNode } from 'react';
import { ComplianceStatusBanner } from '../../src/components/compliance/ComplianceStatusBanner';

export default async function ComplianceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="content">
      <ComplianceStatusBanner />
      {children}
    </div>
  );
}
