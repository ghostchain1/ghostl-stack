import type { ProofInput, ProofVerification, ProofVerifier } from './types';

const isHex = (value: string) => /^0x[0-9a-fA-F]{64}$/.test(value);

export class HashOnlyVerifier implements ProofVerifier {
  async verify(input: ProofInput): Promise<ProofVerification> {
    if (!isHex(input.subjectHash)) {
      return { status: 'INVALID', reason: 'invalid_subject_hash' };
    }
    if (!isHex(input.proofHash)) {
      return { status: 'INVALID', reason: 'invalid_proof_hash' };
    }
    if (!input.issuerId.trim()) {
      return { status: 'INVALID', reason: 'missing_issuer' };
    }
    return { status: 'UNVERIFIED', reason: 'hash_only_verifier' };
  }
}
