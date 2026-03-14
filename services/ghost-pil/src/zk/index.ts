import { HashOnlyVerifier } from './hash-only-verifier.js';
import type { ProofVerifier } from './types.js';

export const buildVerifier = (): ProofVerifier => {
  return new HashOnlyVerifier();
};
