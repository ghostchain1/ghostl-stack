import CompliancePage from '../../compliance/page';
import KycPage from '../../kyc/page';

export default async function ComplianceKycPage() {
  return (
    <div className="content">
      <div className="card-grid">
        <div className="card">
          <div className="section-title">Compliance exports & audit</div>
          <CompliancePage />
        </div>
        <div className="card">
          <div className="section-title">KYC operations</div>
          <KycPage />
        </div>
      </div>
    </div>
  );
}
