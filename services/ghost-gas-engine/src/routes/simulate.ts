import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadChains, loadPolicies } from '../config.js';
import { createGhostRpc } from '../rpc/ghost-rpc.js';
import { getActivePolicy } from '../policies/policy.js';
import { simulateTx } from '../services/simulator.js';
import { query } from '../db/index.js';

const requestSchema = z.object({
  chainKey: z.string(),
  txRequest: z.record(z.any())
});

export async function registerSimulationRoutes(app: FastifyInstance) {
  app.post('/v1/simulate', async (req, reply) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request', details: parsed.error.flatten() };
    }

    const chains = loadChains();
    const chain = chains.find((item) => item.key === parsed.data.chainKey);
    if (!chain) {
      reply.code(404);
      return { error: 'unknown_chain' };
    }

    const policies = loadPolicies();
    const fallback = policies.find((p) => p.chainKey === chain.key);
    if (!fallback) {
      reply.code(500);
      return { error: 'missing_policy' };
    }

    const rpc = await createGhostRpc(chain.rpcUrl);
    const policy = await getActivePolicy(chain.key, fallback);
    const simulation = await simulateTx(chain, policy, parsed.data.txRequest, rpc);

    if (simulation.recommendedGasLimit >= simulation.blockGasLimit * BigInt(98) / BigInt(100)) {
      reply.code(409);
    }

    await query(
      `INSERT INTO gas_simulations (chain_key, tx_request, estimated_gas, recommended_gas_limit, block_gas_limit, margin_percent, failure_reason, rpc_namespace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        chain.key,
        parsed.data.txRequest,
        simulation.estimatedGas.toString(),
        simulation.recommendedGasLimit.toString(),
        simulation.blockGasLimit.toString(),
        simulation.marginPercent,
        simulation.likelyFailureReason,
        simulation.rpcNamespace
      ]
    );



    return {
      chain: {
        key: chain.key,
        chainId: chain.chainId,
        name: chain.name,
        type: chain.type,
        gasTokenSymbol: chain.gasTokenSymbol,
        gasTokenAddress: chain.gasTokenAddress
      },
      policy,
      simulation: {
        estimatedGas: simulation.estimatedGas.toString(),
        recommendedGasLimit: simulation.recommendedGasLimit.toString(),
        blockGasLimit: simulation.blockGasLimit.toString(),
        blockGasUsed: simulation.blockGasUsed.toString(),
        marginPercent: simulation.marginPercent,
        likelyFailureReason: simulation.likelyFailureReason,
        rpcNamespace: simulation.rpcNamespace
      }
    };
  });
}
