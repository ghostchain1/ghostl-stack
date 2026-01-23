import { recordAiEvent } from './store.js';

export const recordVerification = async (input: {
  chainKey: string;
  decisionId?: string | null;
  txHash?: string | null;
  status: string;
  classification?: string | null;
}) => {
  await recordAiEvent(input.chainKey, 'verify', 'transaction_checked', {
    decisionId: input.decisionId ?? null,
    txHash: input.txHash ?? null,
    status: input.status,
    classification: input.classification ?? null
  });
};
