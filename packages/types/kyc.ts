export type KycApplicantType = 'individual' | 'business';
export type KycStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_more_info' | 'expired';
export type KycRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type KycDocumentStatus = 'pending' | 'verified' | 'rejected';
export type KycDocumentType =
  | 'passport'
  | 'id_card'
  | 'driver_license'
  | 'proof_of_address'
  | 'selfie'
  | 'corporate_registry'
  | 'beneficial_ownership'
  | 'tax_certificate'
  | 'other';
export type KycReviewDecision = 'approve' | 'reject' | 'request_more_info' | 'escalate';
export type KycEventType =
  | 'created'
  | 'assigned'
  | 'document_uploaded'
  | 'document_reviewed'
  | 'review_submitted'
  | 'risk_overridden'
  | 'status_updated';

export interface KycDocument {
  id: string;
  type: KycDocumentType;
  status: KycDocumentStatus;
  filename?: string;
  uploadedAt: string;
  reviewedAt?: string;
  reviewerId?: string;
  notes?: string;
  source?: string;
}

export interface KycReview {
  id: string;
  reviewerId: string;
  decision: KycReviewDecision;
  reason?: string;
  createdAt: string;
}

export interface KycEvent {
  id: string;
  type: KycEventType;
  actorId?: string;
  createdAt: string;
  detail?: Record<string, string | number | boolean | null>;
}

export interface KycScreening {
  pep: boolean;
  sanctions: boolean;
  adverseMedia: boolean;
  watchlists: string[];
}

export interface KycRiskOverride {
  score: number;
  level: KycRiskLevel;
  reason: string;
  reviewerId?: string;
  createdAt: string;
}

export interface KycApplicant {
  id: string;
  type: KycApplicantType;
  status: KycStatus;
  riskLevel: KycRiskLevel;
  riskScore: number;
  riskOverride?: KycRiskOverride;
  fullName?: string;
  companyName?: string;
  email?: string;
  country?: string;
  walletAddress?: string;
  chainId?: string;
  createdAt: string;
  updatedAt: string;
  lastActionAt?: string;
  assignedTo?: string;
  source?: string;
  screening: KycScreening;
  documents: KycDocument[];
  reviews: KycReview[];
  events: KycEvent[];
  tags?: string[];
}

export interface KycPolicy {
  id: string;
  requiredDocs: {
    individual: KycDocumentType[];
    business: KycDocumentType[];
  };
  autoApproveMax: number;
  autoRejectMin: number;
  highRiskCountries: string[];
  pepRequiresReview: boolean;
  sanctionsAutoReject: boolean;
}

export interface KycSummary {
  total: number;
  byStatus: Record<KycStatus, number>;
  byRisk: Record<KycRiskLevel, number>;
  pendingDocs: number;
  escalations: number;
  avgReviewHours: number;
}

export interface KycProvider {
  name: string;
  url?: string;
  status: 'connected' | 'pending' | 'error';
  lastCheckedAt?: string;
}
