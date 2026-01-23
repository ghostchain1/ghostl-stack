export type ProofStatement =
  | 'KYC_APPROVED'
  | 'NOT_SANCTIONED'
  | 'TX_THRESHOLD_OK'
  | 'JURISDICTION_ALLOWED';

export type ProofInput = {
  subjectHash: string;
  issuerId: string;
  statement: ProofStatement;
  proofHash: string;
  jurisdictionCode: string;
};

export type ProofVerification = {
  status: 'VERIFIED' | 'UNVERIFIED' | 'INVALID';
  reason: string;
};

export interface ProofVerifier {
  verify(input: ProofInput): Promise<ProofVerification>;
}
