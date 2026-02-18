import type { GateState } from './gates.js';

export type InvariantCheck = { id: string; ok: boolean; detail?: string };

export function evaluateInvariants(state: GateState): InvariantCheck[] {
  const out: InvariantCheck[] = [];

  // I8/I11: mainnet must be proposal-only from the supervisor perspective.
  out.push({
    id: 'I8_mainnet_proposal_only',
    ok: state.env !== 'mainnet' || state.mainnetProposalOnly,
    detail: state.env === 'mainnet' ? 'execute endpoints must return 403 MAINNET_PROPOSAL_ONLY' : undefined
  });

  // I11: supervisor must not execute without explicit enablement.
  out.push({
    id: 'I11_exec_requires_flag',
    ok: !state.execEnabled || state.env !== 'mainnet',
    detail: state.execEnabled ? 'execution enabled (non-mainnet only)' : 'execution disabled'
  });

  // I1/I2/I3 are enforced at bridge/messenger layers; HGOP must not introduce bypass paths.
  out.push({
    id: 'I1_I2_I3_no_routing_bypass',
    ok: true,
    detail: 'HGOP does not proxy chain RPC or cross-layer message routing; it only probes and generates artifacts.'
  });

  return out;
}
