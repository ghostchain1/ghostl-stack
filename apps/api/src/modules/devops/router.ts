import { NextFunction, Request, Response, Router } from 'express';
import type { ForkSchedulerService, ReleaseService } from './services';
import { requirePermission } from '../../lib/rbac';

const asyncHandler =
  <TReq extends Request = Request, TRes extends Response = Response>(
    fn: (req: TReq, res: TRes, next: NextFunction) => Promise<unknown>
  ) =>
  (req: TReq, res: TRes, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export interface DevopsDeps {
  releases: ReleaseService;
  forks: ForkSchedulerService;
}

export const buildDevopsRouter = (deps: DevopsDeps) => {
  const router = Router();

  router.get(
    '/releases',
    requirePermission('devops:read'),
    asyncHandler(async (_req, res) => {
      const releases = await deps.releases.list();
      res.json(releases);
    })
  );

  router.post(
    '/releases',
    requirePermission('devops:write'),
    asyncHandler(async (req, res) => {
      const planned = await deps.releases.plan(req.body);
      res.status(201).json(planned);
    })
  );

  router.get(
    '/forks',
    requirePermission('devops:read'),
    asyncHandler(async (_req, res) => {
      const forks = await deps.forks.list();
      res.json(forks);
    })
  );

  router.post(
    '/forks',
    requirePermission('devops:write'),
    asyncHandler(async (req, res) => {
      const scheduled = await deps.forks.schedule(req.body);
      res.status(201).json(scheduled);
    })
  );

  return router;
};
