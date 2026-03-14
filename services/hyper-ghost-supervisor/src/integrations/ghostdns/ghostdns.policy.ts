export type GhostDnsMode = 'devnet' | 'testnet' | 'mainnet';

export function requiresApproval(mode: GhostDnsMode) {
  return mode === 'mainnet';
}

export function canAutoReconcile(mode: GhostDnsMode) {
  return mode !== 'mainnet';
}
