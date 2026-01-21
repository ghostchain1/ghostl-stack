import type { ApiError } from '../../src/lib/api';
import { serverApiRequest } from '../../src/lib/server-api';
import { DataFetchErrorCard } from '../../src/components/DataFetchErrorCard';
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
  const [summaryRes, applicantsRes, providersRes, policyRes] = await Promise.all([
    serverApiRequest<KycSummary>('/kyc/summary', { init: { cache: 'no-store' } }),
    serverApiRequest<KycApplicant[]>('/kyc/applicants', { init: { cache: 'no-store' } }),
    serverApiRequest<{ providers: KycProvider[] }>('/kyc/providers', { init: { cache: 'no-store' } }),
    serverApiRequest<KycPolicy>('/kyc/policy', { init: { cache: 'no-store' } })
  ]);

  const errors: Array<{ title: string; error: ApiError }> = [];
  if (!summaryRes.ok) errors.push({ title: 'KYC summary', error: summaryRes.error });
  if (!applicantsRes.ok) errors.push({ title: 'KYC applicants', error: applicantsRes.error });
  if (!providersRes.ok) errors.push({ title: 'KYC providers', error: providersRes.error });
  if (!policyRes.ok) errors.push({ title: 'KYC policy', error: policyRes.error });

  if (errors.length) {
    return (
      <div className="content">
        <h2>KYC operations</h2>
        <p className="muted">Queue, review, and approve GhostChain KYC applicants.</p>
        <div className="card-grid">
          {errors.map((entry, idx) => (
            <DataFetchErrorCard key={`${entry.title}-${idx}`} title={entry.title} error={entry.error} />
          ))}
        </div>
      </div>
    );
  }

  const summary = summaryRes.data;
  const applicants = applicantsRes.data;
  const providers = providersRes.data.providers || [];
  const policy = policyRes.data;

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
