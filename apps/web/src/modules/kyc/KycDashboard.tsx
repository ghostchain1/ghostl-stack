'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  KycApplicant,
  KycDocumentStatus,
  KycDocumentType,
  KycPolicy,
  KycProvider,
  KycReviewDecision,
  KycSummary
} from '@ghostl/types/kyc';
import { resolveApiBase } from '../../lib/runtime';
import { jsonWithCsrf } from '../../lib/csrf';

const API_URL = resolveApiBase();

const statusOptions = ['pending', 'in_review', 'approved', 'rejected', 'needs_more_info', 'expired'] as const;
const riskOptions = ['low', 'medium', 'high', 'critical'] as const;
const docTypes: KycDocumentType[] = [
  'passport',
  'id_card',
  'driver_license',
  'proof_of_address',
  'selfie',
  'corporate_registry',
  'beneficial_ownership',
  'tax_certificate',
  'other'
];
const reviewDecisions: KycReviewDecision[] = ['approve', 'reject', 'request_more_info', 'escalate'];

type DashboardProps = {
  initialSummary: KycSummary;
  initialApplicants: KycApplicant[];
  initialProviders: KycProvider[];
  initialPolicy: KycPolicy;
};

type Filters = {
  status?: string;
  risk?: string;
  type?: string;
  search?: string;
};

const fetchJson = async <T,>(path: string, options: Parameters<typeof fetch>[1] = {}): Promise<T> => {
  const method = (options.method || 'GET').toUpperCase();
  const headers = method === 'GET' || method === 'HEAD' ? options.headers : jsonWithCsrf(options.headers);
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
};

const formatStatus = (status: string) => status.replace(/_/g, ' ');

export function KycDashboard({ initialSummary, initialApplicants, initialProviders, initialPolicy }: DashboardProps) {
  const [summary, setSummary] = useState<KycSummary>(initialSummary);
  const [providers, setProviders] = useState<KycProvider[]>(initialProviders);
  const [policy, setPolicy] = useState<KycPolicy>(initialPolicy);
  const [applicants, setApplicants] = useState<KycApplicant[]>(initialApplicants);
  const [selectedId, setSelectedId] = useState<string>(initialApplicants[0]?.id || '');
  const [filters, setFilters] = useState<Filters>({});
  const [status, setStatus] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [decision, setDecision] = useState<KycReviewDecision>('approve');
  const [decisionReason, setDecisionReason] = useState('');
  const [newDocType, setNewDocType] = useState<KycDocumentType>('passport');
  const [newDocName, setNewDocName] = useState('');
  const [docUpdates, setDocUpdates] = useState<Record<string, { status: KycDocumentStatus; notes: string }>>({});
  const [riskScore, setRiskScore] = useState('50');
  const [riskReason, setRiskReason] = useState('');
  const [screeningDraft, setScreeningDraft] = useState({ pep: false, sanctions: false, adverseMedia: false });
  const [newApplicant, setNewApplicant] = useState({
    type: 'individual',
    fullName: '',
    companyName: '',
    email: '',
    country: '',
    walletAddress: '',
    chainId: 'l2'
  });

  const selected = useMemo(() => applicants.find((app) => app.id === selectedId) || null, [applicants, selectedId]);

  const loadProviders = async () => {
    const data = await fetchJson<{ providers: KycProvider[] }>('/kyc/providers');
    setProviders(data.providers || []);
  };

  const loadPolicy = async () => {
    const data = await fetchJson<KycPolicy>('/kyc/policy');
    setPolicy(data);
  };

  const loadSummary = async () => {
    const data = await fetchJson<KycSummary>('/kyc/summary');
    setSummary(data);
  };

  const loadApplicants = async (nextFilters: Filters = filters) => {
    const params = new URLSearchParams();
    if (nextFilters.status) params.set('status', nextFilters.status);
    if (nextFilters.risk) params.set('risk', nextFilters.risk);
    if (nextFilters.type) params.set('type', nextFilters.type);
    if (nextFilters.search) params.set('search', nextFilters.search);
    const data = await fetchJson<KycApplicant[]>(`/kyc/applicants${params.toString() ? `?${params}` : ''}`);
    setApplicants(data);
    if (!data.find((app) => app.id === selectedId)) {
      setSelectedId(data[0]?.id || '');
    }
  };

  const reloadAll = async () => {
    try {
      await Promise.all([loadSummary(), loadApplicants(), loadProviders(), loadPolicy()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh';
      setStatus(msg);
    }
  };

  useEffect(() => {
    loadApplicants(filters).catch(() => undefined);
  }, [filters]);

  useEffect(() => {
    if (!selected) return;
    setAssignTo(selected.assignedTo || '');
    setScreeningDraft({
      pep: selected.screening.pep,
      sanctions: selected.screening.sanctions,
      adverseMedia: selected.screening.adverseMedia
    });
  }, [selected?.id]);

  const submitDecision = async () => {
    if (!selected) return;
    setStatus('Submitting review...');
    try {
      await fetchJson(`/kyc/applicants/${selected.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reason: decisionReason })
      });
      setDecisionReason('');
      await reloadAll();
      setStatus('Review submitted.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Review failed');
    }
  };

  const submitAssignment = async () => {
    if (!selected || !assignTo) return;
    setStatus('Assigning reviewer...');
    try {
      await fetchJson(`/kyc/applicants/${selected.id}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewerId: assignTo })
      });
      await reloadAll();
      setStatus('Reviewer assigned.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Assign failed');
    }
  };

  const submitDoc = async () => {
    if (!selected) return;
    setStatus('Uploading document...');
    try {
      await fetchJson(`/kyc/applicants/${selected.id}/documents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: newDocType, filename: newDocName || undefined })
      });
      setNewDocName('');
      await reloadAll();
      setStatus('Document added.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Document add failed');
    }
  };

  const submitDocReview = async (docId: string) => {
    if (!selected) return;
    const update = docUpdates[docId];
    if (!update) return;
    setStatus('Reviewing document...');
    try {
      await fetchJson(`/kyc/applicants/${selected.id}/documents/${docId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update)
      });
      setDocUpdates((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
      await reloadAll();
      setStatus('Document updated.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Document review failed');
    }
  };

  const submitRiskOverride = async () => {
    if (!selected) return;
    const score = Number(riskScore);
    if (Number.isNaN(score)) return;
    setStatus('Updating risk score...');
    try {
      await fetchJson(`/kyc/applicants/${selected.id}/risk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score, reason: riskReason || 'manual override' })
      });
      setRiskReason('');
      await reloadAll();
      setStatus('Risk override applied.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Risk override failed');
    }
  };

  const submitScreening = async () => {
    if (!selected) return;
    setStatus('Updating screening flags...');
    try {
      await fetchJson(`/kyc/applicants/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ screening: screeningDraft })
      });
      await reloadAll();
      setStatus('Screening updated.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Screening update failed');
    }
  };

  const createApplicant = async () => {
    setStatus('Creating applicant...');
    try {
      await fetchJson('/kyc/applicants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: newApplicant.type,
          fullName: newApplicant.fullName || undefined,
          companyName: newApplicant.companyName || undefined,
          email: newApplicant.email || undefined,
          country: newApplicant.country || undefined,
          walletAddress: newApplicant.walletAddress || undefined,
          chainId: newApplicant.chainId || undefined
        })
      });
      setNewApplicant({
        type: 'individual',
        fullName: '',
        companyName: '',
        email: '',
        country: '',
        walletAddress: '',
        chainId: 'l2'
      });
      await reloadAll();
      setStatus('Applicant created.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const requiredDocs = selected ? policy.requiredDocs[selected.type] || [] : [];
  const verifiedDocs = new Set((selected?.documents || []).filter((d) => d.status === 'verified').map((d) => d.type));
  const missingDocs = requiredDocs.filter((doc) => !verifiedDocs.has(doc));
  const selectedEvents = selected?.events || [];
  const selectedReviews = selected?.reviews || [];

  return (
    <div className="stack">
      <div className="card-grid">
        <div className="card">
          <div className="muted">Total applicants</div>
          <div className="metric">{summary.total}</div>
          <div className="muted">Pending docs: {summary.pendingDocs}</div>
        </div>
        <div className="card">
          <div className="muted">Queue</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Pending</span>
            <strong>{summary.byStatus.pending}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>In review</span>
            <strong>{summary.byStatus.in_review}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Needs info</span>
            <strong>{summary.byStatus.needs_more_info}</strong>
          </div>
        </div>
        <div className="card">
          <div className="muted">Decisions</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Approved</span>
            <strong>{summary.byStatus.approved}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Rejected</span>
            <strong>{summary.byStatus.rejected}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Escalations</span>
            <strong>{summary.escalations}</strong>
          </div>
        </div>
        <div className="card">
          <div className="muted">Risk distribution</div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Low</span>
            <strong>{summary.byRisk.low}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Medium</span>
            <strong>{summary.byRisk.medium}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>High/Critical</span>
            <strong>{summary.byRisk.high + summary.byRisk.critical}</strong>
          </div>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>KYC providers</div>
          {providers.map((provider) => (
            <div key={provider.name} className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div>{provider.name}</div>
                <div className="muted">{provider.url || 'No endpoint set'}</div>
              </div>
              <div className={`badge ${provider.status === 'connected' ? 'ok' : provider.status === 'pending' ? 'warn' : 'bad'}`}>
                {provider.status}
              </div>
            </div>
          ))}
          {!providers.length && <div className="muted">No providers configured.</div>}
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Policy</div>
          <div className="muted">Auto-approve &lt;= {policy.autoApproveMax} risk score.</div>
          <div className="muted">Auto-reject &gt;= {policy.autoRejectMin} risk score.</div>
          <div className="muted">High-risk countries: {policy.highRiskCountries.join(', ') || 'None'}</div>
          <div className="muted">PEP review: {policy.pepRequiresReview ? 'required' : 'optional'}</div>
          <div className="muted">Sanctions auto-reject: {policy.sanctionsAutoReject ? 'enabled' : 'disabled'}</div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick intake</div>
          <div className="stack">
            <div className="row">
              <select
                className="input"
                value={newApplicant.type}
                onChange={(e) => setNewApplicant((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
              <input
                className="input"
                placeholder="Name / Company"
                value={newApplicant.type === 'business' ? newApplicant.companyName : newApplicant.fullName}
                onChange={(e) =>
                  setNewApplicant((prev) =>
                    prev.type === 'business'
                      ? { ...prev, companyName: e.target.value }
                      : { ...prev, fullName: e.target.value }
                  )
                }
              />
            </div>
            <div className="row">
              <input
                className="input"
                placeholder="Email"
                value={newApplicant.email}
                onChange={(e) => setNewApplicant((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Country (e.g. US)"
                value={newApplicant.country}
                onChange={(e) => setNewApplicant((prev) => ({ ...prev, country: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="row">
              <input
                className="input"
                placeholder="Wallet address"
                value={newApplicant.walletAddress}
                onChange={(e) => setNewApplicant((prev) => ({ ...prev, walletAddress: e.target.value }))}
              />
              <select
                className="input"
                value={newApplicant.chainId}
                onChange={(e) => setNewApplicant((prev) => ({ ...prev, chainId: e.target.value }))}
              >
                <option value="l1">GhostChain (L1)</option>
                <option value="l2">GhostL2</option>
                <option value="l3">GhostL3</option>
              </select>
            </div>
            <button className="button" type="button" onClick={createApplicant}>
              Add applicant
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Queue filters</div>
        <div className="row">
          <select
            className="input"
            value={filters.status || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value || undefined }))}
          >
            <option value="">All statuses</option>
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {formatStatus(opt)}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.risk || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, risk: e.target.value || undefined }))}
          >
            <option value="">All risk levels</option>
            {riskOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.type || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value || undefined }))}
          >
            <option value="">All types</option>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
          <input
            className="input"
            placeholder="Search name, email, wallet"
            value={filters.search || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
          />
          <button className="button secondary" type="button" onClick={reloadAll}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card-grid">
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Applicant queue</div>
          <div className="stack">
            {applicants.map((applicant) => (
              <button
                key={applicant.id}
                type="button"
                className={`row ${selectedId === applicant.id ? 'active' : ''}`}
                style={{
                  justifyContent: 'space-between',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  background: 'transparent',
                  color: 'inherit'
                }}
                onClick={() => setSelectedId(applicant.id)}
              >
                <div>
                  <div>{applicant.fullName || applicant.companyName || 'Unnamed applicant'}</div>
                  <div className="muted">{applicant.email || applicant.walletAddress || 'No contact'}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <span className={`badge ${applicant.status === 'approved' ? 'ok' : applicant.status === 'rejected' ? 'bad' : 'warn'}`}>
                    {formatStatus(applicant.status)}
                  </span>
                  <span className={`badge ${applicant.riskLevel === 'low' ? 'ok' : applicant.riskLevel === 'medium' ? 'warn' : 'bad'}`}>
                    {applicant.riskLevel} ({applicant.riskScore})
                  </span>
                </div>
              </button>
            ))}
            {!applicants.length && <div className="muted">No applicants match this filter.</div>}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Applicant detail</div>
          {!selected && <div className="muted">Select an applicant to review.</div>}
          {selected && (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div>{selected.fullName || selected.companyName || 'Unnamed applicant'}</div>
                  <div className="muted">{selected.email || 'No email'}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end' }}>
                  <span className={`badge ${selected.status === 'approved' ? 'ok' : selected.status === 'rejected' ? 'bad' : 'warn'}`}>
                    {formatStatus(selected.status)}
                  </span>
                  <span className={`badge ${selected.riskLevel === 'low' ? 'ok' : selected.riskLevel === 'medium' ? 'warn' : 'bad'}`}>
                    {selected.riskLevel} ({selected.riskScore})
                  </span>
                </div>
              </div>
              <div className="muted">Country: {selected.country || 'Unknown'}</div>
              <div className="muted">Wallet: {selected.walletAddress || 'None'} ({selected.chainId || 'n/a'})</div>
              <div className="muted">Assigned to: {selected.assignedTo || 'Unassigned'}</div>
              <div className="muted">Created: {selected.createdAt}</div>
              <div className="muted">Last action: {selected.lastActionAt || 'n/a'}</div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Missing required docs</div>
                {missingDocs.length ? (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {missingDocs.map((doc) => (
                      <span key={doc} className="chip">
                        {doc}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="muted">All required docs present.</div>
                )}
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Screening flags</div>
                <div className="row">
                  <label className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={screeningDraft.pep}
                      onChange={(e) => setScreeningDraft((prev) => ({ ...prev, pep: e.target.checked }))}
                    />
                    PEP
                  </label>
                  <label className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={screeningDraft.sanctions}
                      onChange={(e) => setScreeningDraft((prev) => ({ ...prev, sanctions: e.target.checked }))}
                    />
                    Sanctions
                  </label>
                  <label className="row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={screeningDraft.adverseMedia}
                      onChange={(e) => setScreeningDraft((prev) => ({ ...prev, adverseMedia: e.target.checked }))}
                    />
                    Adverse media
                  </label>
                  <button className="button secondary" type="button" onClick={submitScreening}>
                    Update flags
                  </button>
                </div>
                {selected.screening.watchlists.length > 0 && (
                  <div className="muted">Watchlists: {selected.screening.watchlists.join(', ')}</div>
                )}
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Assign reviewer</div>
                <div className="row">
                  <input
                    className="input"
                    placeholder="Reviewer id or email"
                    value={assignTo}
                    onChange={(e) => setAssignTo(e.target.value)}
                  />
                  <button className="button secondary" type="button" onClick={submitAssignment}>
                    Assign
                  </button>
                </div>
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Documents</div>
                <div className="row">
                  <select className="input" value={newDocType} onChange={(e) => setNewDocType(e.target.value as KycDocumentType)}>
                    {docTypes.map((doc) => (
                      <option key={doc} value={doc}>
                        {doc}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Filename or reference"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                  />
                  <button className="button secondary" type="button" onClick={submitDoc}>
                    Add
                  </button>
                </div>
                <div className="stack" style={{ marginTop: 12 }}>
                  {selected.documents.map((doc) => {
                    const update = docUpdates[doc.id] || { status: doc.status, notes: doc.notes || '' };
                    return (
                      <div key={doc.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <div>{doc.type}</div>
                          <div className="muted">{doc.filename || 'no filename'}</div>
                        </div>
                        <div className="row" style={{ gap: 6 }}>
                          <select
                            className="input"
                            value={update.status}
                            onChange={(e) =>
                              setDocUpdates((prev) => ({
                                ...prev,
                                [doc.id]: { ...update, status: e.target.value as KycDocumentStatus }
                              }))
                            }
                          >
                            <option value="pending">pending</option>
                            <option value="verified">verified</option>
                            <option value="rejected">rejected</option>
                          </select>
                          <input
                            className="input"
                            placeholder="Notes"
                            value={update.notes}
                            onChange={(e) =>
                              setDocUpdates((prev) => ({
                                ...prev,
                                [doc.id]: { ...update, notes: e.target.value }
                              }))
                            }
                          />
                          <button className="button secondary" type="button" onClick={() => submitDocReview(doc.id)}>
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!selected.documents.length && <div className="muted">No documents uploaded yet.</div>}
                </div>
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Risk override</div>
                <div className="row">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    value={riskScore}
                    onChange={(e) => setRiskScore(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Reason"
                    value={riskReason}
                    onChange={(e) => setRiskReason(e.target.value)}
                  />
                  <button className="button secondary" type="button" onClick={submitRiskOverride}>
                    Override
                  </button>
                </div>
                {selected.riskOverride && (
                  <div className="muted">Manual override: {selected.riskOverride.score} ({selected.riskOverride.level})</div>
                )}
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Review decision</div>
                <div className="row">
                  <select className="input" value={decision} onChange={(e) => setDecision(e.target.value as KycReviewDecision)}>
                    {reviewDecisions.map((opt) => (
                      <option key={opt} value={opt}>
                        {formatStatus(opt)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Reason / notes"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                  />
                  <button className="button" type="button" onClick={submitDecision}>
                    Submit
                  </button>
                </div>
              </div>

              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Activity</div>
                <div className="stack">
                  {selectedEvents.slice(0, 6).map((event) => (
                    <div key={event.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <div>{formatStatus(event.type)}</div>
                        <div className="muted">{event.actorId || 'system'}</div>
                      </div>
                      <div className="muted">{event.createdAt}</div>
                    </div>
                  ))}
                  {selectedEvents.length === 0 && <div className="muted">No activity recorded yet.</div>}
                  {selectedReviews.map((review) => (
                    <div key={review.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <div>{formatStatus(review.decision)}</div>
                        <div className="muted">{review.reason || 'No reason provided'}</div>
                      </div>
                      <div className="muted">{review.createdAt}</div>
                    </div>
                  ))}
                  {!selectedReviews.length && <div className="muted">No reviews submitted yet.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {status && <div className="muted">{status}</div>}
    </div>
  );
}
