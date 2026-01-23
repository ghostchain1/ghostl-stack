import { config, loadChains } from '../config.js';
import { createGhostRpc } from '../rpc/ghost-rpc.js';
import { observeChain } from './observe.js';
import { predictChainRisk } from './predict.js';
import { decideForChain } from './decide.js';
import { evaluateGovernance } from './govern.js';
import { recordAiEvent } from './store.js';

let running = false;

export const runAiCoreCycle = async () => {
  if (running) return;
  running = true;

  const chains = loadChains();
  const start = Date.now();

  try {
    for (const chain of chains) {
      try {
        const rpc = await createGhostRpc(chain.rpcUrl);
        await recordAiEvent(chain.key, 'observe', 'cycle_start', { chainId: chain.chainId });

        const observation = await observeChain(chain, rpc);
        const prediction = await predictChainRisk(chain, {
          gasLimit: observation.gasLimit,
          gasUsed: observation.gasUsed
        });

        await decideForChain({
          chain,
          prediction: {
            id: prediction.predictionId,
            riskScore: prediction.riskScore,
            confidence: prediction.confidence,
            recommendedAction: prediction.recommendedAction,
            affectedSubsystem: prediction.affectedSubsystem,
            features: prediction.features
          }
        });

        await evaluateGovernance(chain, {
          riskScore: prediction.riskScore,
          recommendedAction: prediction.recommendedAction,
          affectedSubsystem: prediction.affectedSubsystem
        });
      } catch (err) {
        await recordAiEvent(chain.key, 'observe', 'cycle_error', {
          error: err instanceof Error ? err.message : 'unknown_error'
        });
      }
    }
  } finally {
    running = false;
    const durationMs = Date.now() - start;
    if (chains.length) {
      await recordAiEvent(chains[0].key, 'learn', 'cycle_complete', { durationMs, chains: chains.length });
    }
  }
};

export const startAiCoreLoop = () => {
  const intervalMs = Math.max(config.AUTONOMY_FORECAST_INTERVAL_SECONDS * 1000, 30000);
  const tick = () => {
    runAiCoreCycle().catch(() => undefined);
  };
  tick();
  setInterval(tick, intervalMs);
};
