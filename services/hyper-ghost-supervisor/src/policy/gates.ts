import type { HgEnv } from '../types/hgop.js';

export type GateState = {
  env: HgEnv;
  execEnabled: boolean;
  approvalTokenConfigured: boolean;
  mainnetProposalOnly: boolean;
};

export class GateError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const requireApprovalToken = (expected: string | undefined, provided: string | undefined) => {
  if (!expected) throw new GateError(503, 'approval_token_not_configured');
  if (!provided) throw new GateError(401, 'missing_approval_token');
  if (provided !== expected) throw new GateError(403, 'invalid_approval_token');
};

export const deriveGateState = (env: HgEnv, execEnabled: boolean, approvalToken?: string): GateState => ({
  env,
  execEnabled,
  approvalTokenConfigured: Boolean(approvalToken),
  mainnetProposalOnly: env === 'mainnet'
});

export const guardMutating = (env: HgEnv, approvalToken?: string, providedToken?: string) => {
  if (env === 'devnet') return;
  // testnet/mainnet require explicit approval token for mutating endpoints.
  requireApprovalToken(approvalToken, providedToken);
};

export const guardExecute = (env: HgEnv, execEnabled: boolean, approvalToken?: string, providedToken?: string) => {
  if (env === 'mainnet') throw new GateError(403, 'MAINNET_PROPOSAL_ONLY');
  if (!execEnabled) throw new GateError(403, 'EXEC_DISABLED');
  if (env === 'testnet') requireApprovalToken(approvalToken, providedToken);
};
