import { apiFetch } from '../../src/lib/api';
import type { KycApplicant, KycPolicy, KycProvider, KycSummary } from '@ghostl/types/kyc';
import { KycDashboard } from '../../src/modules/kyc/KycDashboard';

const emptySummary: KycSummary = {
  total: 0,
  byStatus: {
    pending: 0,
    in_review: 0,
    approved: 0,
    rejected: 0,
    needs_more_info: 0,
    expired: 0
  },
  byRisk: {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  },
  pendingDocs: 0,
  escalations: 0,
  avgReviewHours: 0
};

export default async function KycPage() {
  const summary = await apiFetch<KycSummary>('/kyc/summary', { fallback: emptySummary }).catch(() => emptySummary);
  const applicants = await apiFetch<KycApplicant[]>('/kyc/applicants', { fallback: [] }).catch(() => []);
  const providers = await apiFetch<{ providers: KycProvider[] }>('/kyc/providers', { fallback: { providers: [] } })
    .then((r) => r.providers || [])
    .catch(() => []);
  const policy = await apiFetch<KycPolicy>('/kyc/policy', { fallback: {
    id: 'default',
    requiredDocs: { individual: [], business: [] },
    autoApproveMax: 0,
    autoRejectMin: 100,
    highRiskCountries: [],
    pepRequiresReview: true,
    sanctionsAutoReject: true
  } }).catch(() => ({
    id: 'default',
    requiredDocs: { individual: [], business: [] },
    autoApproveMax: 0,
    autoRejectMin: 100,
    highRiskCountries: [],
    pepRequiresReview: true,
    sanctionsAutoReject: true
  }));

  return (
    <div className="content">
      <h2>KYC operations</h2>
      <p className="muted">Queue, review, and approve GhostChain KYC applicants.</p>
      <KycDashboard
        initialSummary={summary}
        initialApplicants={applicants}
        initialProviders={providers}
        initialPolicy={policy}
      />
    </div>
  );
}
