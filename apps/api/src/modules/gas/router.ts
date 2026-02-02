import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { GasEngineClient } from '../../clients/gas-engine';

const limitSchema = z.coerce.number().int().min(1).max(200).optional();

export interface GasDeps {
  gasEngine?: GasEngineClient;
}

const requireGasEngine = (deps: GasDeps) => {
  if (!deps.gasEngine) {
    const err = new Error('gas_engine_unavailable');
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  return deps.gasEngine;
};

export const buildGasRouter = (deps: GasDeps) => {
  const router = Router();

  const handle = (fn: (gasEngine: GasEngineClient, chain: string, limit?: number) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const gasEngine = requireGasEngine(deps);
        const rawChain = req.params.chain;
        const chainValue = Array.isArray(rawChain) ? rawChain[0] : rawChain;
        const chain = (chainValue || 'l1').toLowerCase();
        const limitParse = limitSchema.safeParse(req.query.limit);
        const limit = limitParse.success ? limitParse.data : undefined;
        const payload = await fn(gasEngine, chain, limit);
        res.json(payload);
      } catch (err) {
        const status = (err as Error & { status?: number }).status ?? 502;
        res.status(status).json({ error: (err as Error).message || 'gas_proxy_failed' });
      }
    };

  router.get('/:chain/metrics', handle((gasEngine, chain, limit) => gasEngine.gasMetrics(chain, limit)));
  router.get('/:chain/recommendation', handle((gasEngine, chain) => gasEngine.gasRecommendations(chain)));
  router.get('/:chain/policy', handle((gasEngine, chain) => gasEngine.gasPolicy(chain)));
  router.get('/:chain/slashing', handle((gasEngine, chain, limit) => gasEngine.slashingEvents(chain, limit)));

  return router;
};
