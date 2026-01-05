import { Request, Response, Router } from 'express';
import type {
  ChainStatusService,
  ConsensusTelemetryService,
  PeerGraphService
} from './services';

const asyncHandler =
  <TReq extends Request = Request, TRes extends Response = Response>(fn: (req: TReq, res: TRes, next: any) => Promise<any>) =>
  (req: TReq, res: TRes, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export interface ChainDeps {
  status: ChainStatusService;
  telemetry: ConsensusTelemetryService;
  peers: PeerGraphService;
}

export const buildChainRouter = (deps: ChainDeps) => {
  const router = Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      const [info, epoch, blockTimeMs, finalityLag, reorgs] = await Promise.all([
        deps.status.getChainInfo(),
        deps.status.getEpochInfo(),
        deps.status.getBlockTimeMs(),
        deps.status.getFinalityLag(),
        deps.status.getReorgEvents(5)
      ]);
      res.json({ info, epoch, blockTimeMs, finalityLag, reorgs });
    })
  );

  router.get(
    '/peers',
    asyncHandler(async (_req, res) => {
      const peers = await deps.peers.listPeers();
      const topology = await deps.peers.getTopology();
      res.json({ peers, topology });
    })
  );

  router.get(
    '/telemetry',
    asyncHandler(async (_req, res) => {
      const [participation, latency, health] = await Promise.all([
        deps.telemetry.getParticipationRate(),
        deps.telemetry.getLatencyMetrics(),
        deps.telemetry.getHealthSummary()
      ]);
      res.json({ participation, latency, health });
    })
  );

  return router;
};
