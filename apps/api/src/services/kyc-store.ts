import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  KycApplicant,
  KycApplicantType,
  KycDocument,
  KycDocumentStatus,
  KycDocumentType,
  KycEventType,
  KycPolicy,
  KycReview,
  KycReviewDecision,
  KycRiskLevel,
  KycSummary
} from '@ghostchain/types';

type StoreShape = {
  applicants: KycApplicant[];
  policy: KycPolicy;
};

const DEFAULT_POLICY: KycPolicy = {
  id: 'default',
  requiredDocs: {
    individual: ['passport', 'selfie', 'proof_of_address'],
    business: ['corporate_registry', 'beneficial_ownership', 'proof_of_address']
  },
  autoApproveMax: 30,
  autoRejectMin: 85,
  highRiskCountries: ['IR', 'KP', 'RU', 'SY', 'BY'],
  pepRequiresReview: true,
  sanctionsAutoReject: true
};

const now = () => new Date().toISOString();

const recordKey = () => randomUUID();

const emptyScreening = () => ({
  pep: false,
  sanctions: false,
  adverseMedia: false,
  watchlists: []
});

const calcRiskLevel = (score: number): KycRiskLevel => {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

const buildBaseApplicant = (input: Partial<KycApplicant> & { type: KycApplicantType }) => {
  const createdAt = now();
  return {
    id: recordKey(),
    status: 'pending' as const,
    riskLevel: 'low' as const,
    riskScore: 0,
    createdAt,
    updatedAt: createdAt,
    lastActionAt: createdAt,
    screening: input.screening || emptyScreening(),
    documents: input.documents || [],
    reviews: input.reviews || [],
    events: input.events || [],
    ...input
  } satisfies KycApplicant;
};

const loadStore = async (): Promise<StoreShape> => {
  const filePath = process.env.KYC_STORE_PATH || path.join(process.cwd(), 'data', 'kyc.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as StoreShape;
    if (!data.policy) data.policy = DEFAULT_POLICY;
    if (!data.applicants) data.applicants = [];
    return data;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const seed = buildSeedApplicants();
    const initial: StoreShape = { applicants: seed, policy: DEFAULT_POLICY };
    await fs.writeFile(filePath, JSON.stringify(initial, null, 2));
    return initial;
  }
};

const saveStore = async (store: StoreShape) => {
  const filePath = process.env.KYC_STORE_PATH || path.join(process.cwd(), 'data', 'kyc.json');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2));
};

const buildSeedApplicants = (): KycApplicant[] => {
  const alice = buildBaseApplicant({
    type: 'individual',
    fullName: 'Alice Morgan',
    email: 'alice@ghostl.dev',
    country: 'US',
    walletAddress: '0xAaa0000000000000000000000000000000000000',
    chainId: 'l1',
    screening: { pep: false, sanctions: false, adverseMedia: false, watchlists: [] },
    tags: ['retail', 'priority'],
    documents: [
      { id: recordKey(), type: 'passport', status: 'verified', filename: 'passport_alice.pdf', uploadedAt: now() },
      { id: recordKey(), type: 'selfie', status: 'verified', filename: 'selfie_alice.jpg', uploadedAt: now() }
    ]
  });
  const bob = buildBaseApplicant({
    type: 'business',
    companyName: 'Ghost Mining LLC',
    email: 'ops@ghostchain.cloud',
    country: 'SG',
    walletAddress: '0xBbb0000000000000000000000000000000000000',
    chainId: 'l2',
    screening: { pep: true, sanctions: false, adverseMedia: false, watchlists: ['PEP watchlist'] },
    tags: ['institutional'],
    documents: [
      { id: recordKey(), type: 'corporate_registry', status: 'pending', filename: 'registry.pdf', uploadedAt: now() },
      { id: recordKey(), type: 'beneficial_ownership', status: 'pending', filename: 'ubo.pdf', uploadedAt: now() }
    ]
  });
  const carol = buildBaseApplicant({
    type: 'individual',
    fullName: 'Carol Singh',
    email: 'carol@ghostl.dev',
    country: 'IN',
    walletAddress: '0xCcc0000000000000000000000000000000000000',
    chainId: 'l3',
    screening: { pep: false, sanctions: false, adverseMedia: true, watchlists: ['media:fraud'] },
    tags: ['review'],
    documents: [
      { id: recordKey(), type: 'id_card', status: 'rejected', filename: 'id_carol.png', uploadedAt: now(), notes: 'Blurred' },
      { id: recordKey(), type: 'proof_of_address', status: 'pending', filename: 'utility.pdf', uploadedAt: now() }
    ]
  });
  return [alice, bob, carol];
};

const computeRisk = (applicant: KycApplicant, policy: KycPolicy) => {
  if (applicant.riskOverride) {
    return {
      score: applicant.riskOverride.score,
      level: applicant.riskOverride.level
    };
  }
  let score = 15;
  if (applicant.type === 'business') score += 10;
  const country = applicant.country ? applicant.country.toUpperCase() : '';
  if (country && policy.highRiskCountries.includes(country)) score += 25;
  if (applicant.screening.pep) score += 20;
  if (applicant.screening.adverseMedia) score += 10;
  if (applicant.screening.sanctions) score += 60;

  const required = policy.requiredDocs[applicant.type] || [];
  const verified = new Set(
    applicant.documents.filter((doc) => doc.status === 'verified').map((doc) => doc.type)
  );
  const rejectedCount = applicant.documents.filter((doc) => doc.status === 'rejected').length;
  const missingCount = required.filter((doc) => !verified.has(doc)).length;
  score += missingCount * 5;
  score += rejectedCount * 10;

  if (score > 100) score = 100;
  const level = calcRiskLevel(score);
  return { score, level };
};

const updateApplicantRisk = (applicant: KycApplicant, policy: KycPolicy) => {
  const { score, level } = computeRisk(applicant, policy);
  applicant.riskScore = score;
  applicant.riskLevel = level;
};

const applyPolicy = (applicant: KycApplicant, policy: KycPolicy) => {
  if (policy.sanctionsAutoReject && applicant.screening.sanctions && applicant.status !== 'approved') {
    applicant.status = 'rejected';
    return;
  }
  if (applicant.status !== 'pending') return;
  if (policy.pepRequiresReview && applicant.screening.pep) {
    applicant.status = 'in_review';
  }
  const required = policy.requiredDocs[applicant.type] || [];
  const verified = new Set(
    applicant.documents.filter((doc) => doc.status === 'verified').map((doc) => doc.type)
  );
  const missing = required.filter((doc) => !verified.has(doc));
  if (missing.length === 0 && applicant.status === 'pending') {
    applicant.status = 'in_review';
  }
};

const updateTimestamps = (applicant: KycApplicant) => {
  applicant.updatedAt = now();
  applicant.lastActionAt = applicant.updatedAt;
};

const pushEvent = (applicant: KycApplicant, type: KycEventType, detail: Record<string, string | number | boolean | null>, actorId?: string) => {
  applicant.events.unshift({
    id: recordKey(),
    type,
    actorId,
    createdAt: now(),
    detail
  });
};

const countBy = <T extends string>(values: T[], all: T[]) => {
  const base = Object.fromEntries(all.map((v) => [v, 0])) as Record<T, number>;
  values.forEach((v) => {
    base[v] = (base[v] || 0) + 1;
  });
  return base;
};

export const createKycService = async () => {
  const store = await loadStore();
  const persist = async () => saveStore(store);

  const list = (filters?: {
    status?: string;
    risk?: string;
    search?: string;
    assignedTo?: string;
    type?: string;
  }) => {
    const search = filters?.search?.toLowerCase() || '';
    return store.applicants.filter((app) => {
      if (filters?.status && app.status !== filters.status) return false;
      if (filters?.risk && app.riskLevel !== filters.risk) return false;
      if (filters?.type && app.type !== filters.type) return false;
      if (filters?.assignedTo && app.assignedTo !== filters.assignedTo) return false;
      if (!search) return true;
      const fields = [
        app.fullName,
        app.companyName,
        app.email,
        app.walletAddress,
        app.country
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return fields.includes(search);
    });
  };

  const get = (id: string) => store.applicants.find((app) => app.id === id) || null;

  const createApplicant = (input: {
    type: KycApplicantType;
    fullName?: string;
    companyName?: string;
    email?: string;
    country?: string;
    walletAddress?: string;
    chainId?: string;
    screening?: Partial<KycApplicant['screening']>;
    tags?: string[];
    source?: string;
  }) => {
    const applicant = buildBaseApplicant({
      type: input.type,
      fullName: input.fullName,
      companyName: input.companyName,
      email: input.email,
      country: input.country,
      walletAddress: input.walletAddress,
      chainId: input.chainId,
      screening: { ...emptyScreening(), ...input.screening },
      tags: input.tags || [],
      source: input.source || 'self_service',
      documents: [],
      reviews: [],
      events: []
    });
    updateApplicantRisk(applicant, store.policy);
    applyPolicy(applicant, store.policy);
    pushEvent(applicant, 'created', { status: applicant.status }, 'system');
    store.applicants.unshift(applicant);
    return applicant;
  };

  const assignReviewer = (id: string, reviewerId: string, actorId?: string) => {
    const applicant = get(id);
    if (!applicant) return null;
    applicant.assignedTo = reviewerId;
    updateTimestamps(applicant);
    pushEvent(applicant, 'assigned', { reviewerId }, actorId);
    return applicant;
  };

  const addDocument = (id: string, input: { type: KycDocumentType; filename?: string; source?: string }, actorId?: string) => {
    const applicant = get(id);
    if (!applicant) return null;
    const doc: KycDocument = {
      id: recordKey(),
      type: input.type,
      status: 'pending',
      filename: input.filename,
      source: input.source,
      uploadedAt: now()
    };
    applicant.documents.unshift(doc);
    updateApplicantRisk(applicant, store.policy);
    applyPolicy(applicant, store.policy);
    updateTimestamps(applicant);
    pushEvent(applicant, 'document_uploaded', { docType: input.type }, actorId);
    return doc;
  };

  const reviewDocument = (
    id: string,
    docId: string,
    input: { status: KycDocumentStatus; notes?: string },
    reviewerId: string
  ) => {
    const applicant = get(id);
    if (!applicant) return null;
    const doc = applicant.documents.find((d) => d.id === docId);
    if (!doc) return null;
    doc.status = input.status;
    doc.notes = input.notes;
    doc.reviewerId = reviewerId;
    doc.reviewedAt = now();
    updateApplicantRisk(applicant, store.policy);
    applyPolicy(applicant, store.policy);
    updateTimestamps(applicant);
    pushEvent(applicant, 'document_reviewed', { docType: doc.type, status: doc.status }, reviewerId);
    return doc;
  };

  const addReview = (id: string, input: { decision: KycReviewDecision; reason?: string }, reviewerId: string) => {
    const applicant = get(id);
    if (!applicant) return null;
    const review: KycReview = {
      id: recordKey(),
      reviewerId,
      decision: input.decision,
      reason: input.reason,
      createdAt: now()
    };
    applicant.reviews.unshift(review);
    if (input.decision === 'approve') applicant.status = 'approved';
    if (input.decision === 'reject') applicant.status = 'rejected';
    if (input.decision === 'request_more_info') applicant.status = 'needs_more_info';
    if (input.decision === 'escalate') applicant.status = 'in_review';
    updateApplicantRisk(applicant, store.policy);
    updateTimestamps(applicant);
    pushEvent(applicant, 'review_submitted', { decision: input.decision }, reviewerId);
    return review;
  };

  const updateApplicant = (id: string, patch: Partial<KycApplicant>, actorId?: string) => {
    const applicant = get(id);
    if (!applicant) return null;
    const mergedScreening = patch.screening ? { ...applicant.screening, ...patch.screening } : applicant.screening;
    const merged = { ...patch, screening: mergedScreening };
    Object.assign(applicant, merged);
    updateApplicantRisk(applicant, store.policy);
    applyPolicy(applicant, store.policy);
    updateTimestamps(applicant);
    pushEvent(applicant, 'status_updated', { status: applicant.status }, actorId);
    return applicant;
  };

  const setRiskOverride = (
    id: string,
    input: { score: number; level?: KycRiskLevel; reason: string },
    reviewerId: string
  ) => {
    const applicant = get(id);
    if (!applicant) return null;
    const score = Math.max(0, Math.min(100, input.score));
    const level = input.level || calcRiskLevel(score);
    applicant.riskOverride = {
      score,
      level,
      reason: input.reason,
      reviewerId,
      createdAt: now()
    };
    updateApplicantRisk(applicant, store.policy);
    applyPolicy(applicant, store.policy);
    updateTimestamps(applicant);
    pushEvent(applicant, 'risk_overridden', { score, level }, reviewerId);
    return applicant;
  };

  const getPolicy = () => store.policy;

  const updatePolicy = (patch: Partial<KycPolicy>) => {
    store.policy = { ...store.policy, ...patch };
    store.applicants.forEach((app) => updateApplicantRisk(app, store.policy));
    return store.policy;
  };

  const summary = (): KycSummary => {
    const statuses = store.applicants.map((app) => app.status);
    const risks = store.applicants.map((app) => app.riskLevel);
    const pendingDocs = store.applicants.reduce(
      (acc, app) => acc + app.documents.filter((doc) => doc.status === 'pending').length,
      0
    );
    const reviews = store.applicants.flatMap((app) => app.reviews.map((r) => ({ app, review: r })));
    const reviewDurations = reviews.map(({ app, review }) => {
      const start = new Date(app.createdAt).getTime();
      const end = new Date(review.createdAt).getTime();
      return Math.max(0, end - start);
    });
    const avgReviewHours =
      reviewDurations.length === 0
        ? 0
        : Math.round((reviewDurations.reduce((a, b) => a + b, 0) / reviewDurations.length / 3600000) * 10) / 10;
    const escalations = reviews.filter((r) => r.review.decision === 'escalate').length;
    return {
      total: store.applicants.length,
      byStatus: countBy(statuses, ['pending', 'in_review', 'approved', 'rejected', 'needs_more_info', 'expired']),
      byRisk: countBy(risks, ['low', 'medium', 'high', 'critical']),
      pendingDocs,
      escalations,
      avgReviewHours
    };
  };

  return {
    list,
    get,
    createApplicant,
    assignReviewer,
    addDocument,
    reviewDocument,
    addReview,
    updateApplicant,
    setRiskOverride,
    getPolicy,
    updatePolicy,
    summary,
    async save() {
      await persist();
    }
  };
};

export type KycService = Awaited<ReturnType<typeof createKycService>>;
