import { Request, Response, Router } from 'express';
import type { NodeHealthService, NodeInventoryService } from './services';

const asyncHandler =
  <TReq extends Request = Request, TRes extends Response = Response>(fn: (req: TReq, res: TRes, next: any) => Promise<any>) =>
  (req: TReq, res: TRes, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export interface NodeDeps {
  inventory: NodeInventoryService;
  health: NodeHealthService;
}

export const buildNodeRouter = (deps: NodeDeps) => {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const nodes = await deps.inventory.list();
      res.json(nodes);
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const node = await deps.inventory.get(req.params.id);
      if (!node) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const metrics = await deps.health.getHealth(req.params.id);
      res.json({ node, metrics });
    })
  );

  router.get(
    '/:id/logs',
    asyncHandler(async (req, res) => {
      const logs = await deps.health.getLogs(req.params.id, Number(req.query.tail) || 100);
      res.json(logs);
    })
  );

  return router;
};
