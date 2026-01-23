import { recordAiEvent, recordAction } from './store.js';

export const recordActionExecution = async (input: {
  chainKey: string;
  decisionId?: string | null;
  actionType: string;
  status: string;
  payload: Record<string, unknown>;
}) => {
  const action = await recordAction({
    decisionId: input.decisionId ?? null,
    chainKey: input.chainKey,
    actionType: input.actionType,
    status: input.status,
    payload: input.payload
  });
  await recordAiEvent(input.chainKey, 'act', 'action_recorded', {
    actionId: action.id,
    actionType: input.actionType,
    status: input.status
  });
  return action;
};
