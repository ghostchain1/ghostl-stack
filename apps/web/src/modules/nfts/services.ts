import { z } from 'zod';
import { apiRequest } from '../../lib/api';

const contractSchema = z.object({
  id: z.string(),
  address: z.string(),
  chainId: z.string(),
  standard: z.string(),
  name: z.string().optional(),
  symbol: z.string().optional(),
  metadataUri: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const tokenSchema = z.object({
  id: z.string(),
  contractId: z.string(),
  contractAddress: z.string(),
  chainId: z.string(),
  tokenId: z.string(),
  owner: z.string(),
  uri: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  mintedAt: z.string(),
  updatedAt: z.string(),
  burnedAt: z.string().optional(),
  lastTx: z.string().optional()
});

const contractsResponse = z.object({
  ok: z.boolean(),
  contracts: z.array(contractSchema)
});

const tokensResponse = z.object({
  ok: z.boolean(),
  tokens: z.array(tokenSchema)
});

export type NftContract = z.infer<typeof contractSchema>;
export type NftToken = z.infer<typeof tokenSchema>;

export async function fetchNftContracts() {
  return apiRequest('/api/nfts/contracts', { schema: contractsResponse });
}

export async function fetchNftTokens(contractId: string, owner?: string) {
  const query = owner ? `?owner=${encodeURIComponent(owner)}` : '';
  return apiRequest(`/api/nfts/contracts/${encodeURIComponent(contractId)}/tokens${query}`, {
    schema: tokensResponse
  });
}
