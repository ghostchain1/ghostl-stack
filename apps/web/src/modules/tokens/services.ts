import { z } from 'zod';
import { apiRequest } from '../../lib/api';

const walletSummarySchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  address: z.string(),
  chainId: z.string(),
  type: z.string().optional(),
  ownerUserId: z.string().optional(),
  status: z.string().optional()
});

const tokenSchema = z.object({
  id: z.string(),
  walletId: z.string().optional(),
  chainId: z.string(),
  address: z.string(),
  type: z.enum(['erc20', 'erc721', 'erc1155']),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().optional(),
  logoUri: z.string().optional(),
  verified: z.boolean().optional(),
  createdAt: z.string(),
  wallet: walletSummarySchema.optional()
});

const tokensResponseSchema = z.object({
  ok: z.boolean(),
  tokens: z.array(tokenSchema),
  meta: z
    .object({
      count: z.number().optional(),
      walletCount: z.number().optional(),
      filters: z.record(z.unknown()).optional()
    })
    .optional()
});

const walletListSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    address: z.string(),
    chainId: z.string(),
    type: z.string(),
    ownerUserId: z.string().optional(),
    status: z.string().optional()
  })
);

export type TokenWithWallet = z.infer<typeof tokenSchema>;
export type TokensResponse = z.infer<typeof tokensResponseSchema>;
export type WalletSummary = z.infer<typeof walletSummarySchema>;
export type WalletList = z.infer<typeof walletListSchema>;

export type TokenQuery = {
  walletId?: string;
  chainId?: string;
  address?: string;
  type?: 'erc20' | 'erc721' | 'erc1155';
  cacheBuster?: number;
};

export async function fetchTokens(query: TokenQuery = {}) {
  const params = new URLSearchParams();
  if (query.walletId) params.set('walletId', query.walletId);
  if (query.chainId) params.set('chainId', query.chainId);
  if (query.address) params.set('address', query.address);
  if (query.type) params.set('type', query.type);
  if (query.cacheBuster) params.set('ts', String(query.cacheBuster));
  const suffix = params.toString();
  const path = suffix ? `/api/tokens?${suffix}` : '/api/tokens';
  return apiRequest<TokensResponse>(path, {
    schema: tokensResponseSchema,
    init: { cache: 'no-store', headers: { 'cache-control': 'no-store' } }
  });
}

export async function fetchWallets() {
  return apiRequest<WalletList>('/wallets', {
    schema: walletListSchema,
    init: { cache: 'no-store', headers: { 'cache-control': 'no-store' } }
  });
}
