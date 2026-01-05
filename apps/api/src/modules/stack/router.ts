import { Router } from 'express';
import { PrometheusClient } from '../../clients/prometheus';
import { GuardClient } from '../../clients/guard';
import { RelayerClient } from '../../clients/relayer';

const parsePromValue = (value?: [number, string]) => {
  if (!value) return undefined;
  const parsed = parseFloat(value[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const queryNumber = async (client: PrometheusClient, q: string) => {
  try {
    const res = await client.query(q);
    return parsePromValue(res[0]?.value);
  } catch {
    return undefined;
  }
};

export interface StackDeps {
  prometheus: PrometheusClient;
  guard?: GuardClient;
  relayer?: RelayerClient;
}

export const buildStackRouter = (deps: StackDeps) => {
  const router = Router();

  router.get('/overview', async (req, res) => {
    const chain = (req.query.chain as string) || 'l2';
    const headQuery = `op_gate_head_block{chain="${chain}"}`;
    const finalizedQuery = `op_gate_finalized_block{chain="${chain}"}`;
    const head = await queryNumber(deps.prometheus, headQuery);
    const finalized = await queryNumber(deps.prometheus, finalizedQuery);
    const lag = head !== undefined && finalized !== undefined ? head - finalized : undefined;

    const relayerFinalized = await queryNumber(deps.prometheus, 'ghost_relayer_finalized_total');
    const relayerErrors = await queryNumber(deps.prometheus, 'ghost_relayer_errors_total');
    const guardAlerts = await queryNumber(deps.prometheus, 'ghost_guard_alerts_total');
    const guardDeposits = await queryNumber(deps.prometheus, 'ghost_guard_deposits_seen_total');

    let guardActiveAlerts: any[] = [];
    if (deps.guard) {
      try {
        guardActiveAlerts = (await deps.guard.listAlerts()) as any[];
      } catch {
        // ignore
      }
    }

    let relayerHealth: any = null;
    if (deps.relayer) {
      try {
        relayerHealth = await deps.relayer.health();
      } catch {
        relayerHealth = null;
      }
    }

    res.json({
      chain,
      head,
      finalized,
      lag,
      relayer: { finalized: relayerFinalized, errors: relayerErrors, health: relayerHealth },
      guard: { alerts: guardAlerts, deposits: guardDeposits, activeAlerts: guardActiveAlerts }
    });
  });

  return router;
};
