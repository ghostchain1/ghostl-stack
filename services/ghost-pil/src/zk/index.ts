import { HashOnlyVerifier } from './hash-only-verifier';
import type { ProofVerifier } from './types';

export const buildVerifier = (): ProofVerifier => {
  return new HashOnlyVerifier();
};
