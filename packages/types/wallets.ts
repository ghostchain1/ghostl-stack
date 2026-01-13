export type WalletType = 'watch' | 'external' | 'custodial';

export interface WalletPolicy {
  dailyLimit?: string;
  weeklyLimit?: string;
  allowlist?: string[];
  denylist?: string[];
  approvalsRequired?: number;
}

export interface WalletRecord {
  id: string;
  label: string;
  address: string;
  chainId: string;
  type: WalletType;
  ownerUserId?: string;
  status?: 'active' | 'pending' | 'revoked';
  policy?: WalletPolicy;
  keyPreview?: string;
  version?: number;
  createdAt: string;
  updatedAt: string;
}
