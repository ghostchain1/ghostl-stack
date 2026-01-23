import type { FailureClassification } from '../jobs/classifier.js';
import { recordAiEvent, recordFailureFingerprint } from './store.js';

export const recordLearningOutcome = async (input: {
  chainKey: string;
  classification: FailureClassification;
  errorSignature: string;
  deploymentId?: string;
  attempt?: number;
}) => {
  if (input.classification !== 'CHAIN_OK') {
    await recordFailureFingerprint({
      chainKey: input.chainKey,
      classification: input.classification,
      errorSignature: input.errorSignature
    });
  }
  await recordAiEvent(input.chainKey, 'learn', 'attempt_outcome', {
    deploymentId: input.deploymentId ?? null,
    attempt: input.attempt ?? null,
    classification: input.classification
  });
};
