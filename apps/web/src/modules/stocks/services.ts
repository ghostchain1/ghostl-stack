import { z } from 'zod';
import { apiRequest } from '../../lib/api';

const marketTokenSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  chainId: z.string(),
  name: z.string().optional(),
  priceUsd: z.string().optional(),
  change24h: z.string().optional(),
  marketCapUsd: z.string().optional(),
  supply: z.string().optional(),
  emissions: z.string().optional(),
  treasuryHoldings: z.string().optional(),
  updatedAt: z.string().optional()
});

const recommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  action: z.enum(['hold', 'reduce', 'increase']),
  confidence: z.number(),
  rationale: z.array(z.string())
});

const responseSchema = z.object({
  ok: z.boolean(),
  tokens: z.array(marketTokenSchema),
  treasury: z
    .object({
      balance: z.string().optional()
    })
    .optional(),
  forecasts: z
    .array(
      z.object({
        metric: z.string().optional(),
        horizon: z.string().optional(),
        value: z.number().optional(),
        confidence: z.number().optional()
      })
    )
    .optional(),
  anomalies: z
    .array(
      z.object({
        id: z.string().optional(),
        score: z.number().optional(),
        reasons: z.array(z.string()).optional()
      })
    )
    .optional(),
  explanations: z
    .array(
      z.object({
        id: z.string().optional(),
        metric: z.string().optional(),
        value: z.string().optional(),
        reasons: z.array(z.string()).optional()
      })
    )
    .optional(),
  recommendations: z.array(recommendationSchema).optional(),
  updatedAt: z.string().optional()
});

export type MarketToken = z.infer<typeof marketTokenSchema>;
export type StockRecommendation = z.infer<typeof recommendationSchema>;
export type StocksResponse = z.infer<typeof responseSchema>;

export async function fetchStocks() {
  return apiRequest<StocksResponse>('/api/stocks', { schema: responseSchema });
}

export type MarketTokenInput = {
  symbol: string;
  chainId: string;
  name?: string;
  priceUsd?: string;
  change24h?: string;
  marketCapUsd?: string;
  treasuryHoldings?: string;
};
