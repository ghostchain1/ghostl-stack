import { NextFunction, Request, Response, Router } from 'express';
import { requirePermission } from '../../lib/rbac';
import type { CriticalLogStore } from './critical-log-store';
import { LogIntelService } from './log-intel';

const asyncHandler =
  <TReq extends Request = Request, TRes extends Response = Response>(
    fn: (req: TReq, res: TRes, next: NextFunction) => Promise<unknown>
  ) =>
  (req: TReq, res: TRes, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export interface ObservabilityLogsApiDeps {
  logIntel: LogIntelService;
  criticalStore?: CriticalLogStore;
}

export const buildObservabilityLogsApiRouter = (deps: ObservabilityLogsApiDeps) => {
  const router = Router();

  router.get(
    '/query',
    asyncHandler(async (req, res) => {
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const events = await deps.logIntel.query(query);
      res.json(events);
    })
  );

  router.get(
    '/stream',
    asyncHandler(async (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const stop = deps.logIntel.tail(query, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
      req.on('close', () => {
        stop?.();
      });
    })
  );

  router.get(
    '/metrics',
    asyncHandler(async (req, res) => {
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const events = await deps.logIntel.query({ ...query, limit: Math.min(query.limit || 1000, 1000) });
      const counts = new Map<string, number>();
      events.forEach((event) => {
        const key = `severity="${event.severity}",component="${event.component}",layer="${event.layer}",chain="${event.chain}"`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      const lines = [
        '# HELP ghost_observability_log_events_total Count of normalized log events.',
        '# TYPE ghost_observability_log_events_total counter',
        ...Array.from(counts.entries()).map(([labels, count]) => `ghost_observability_log_events_total{${labels}} ${count}`)
      ];
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.send(lines.join('\\n'));
    })
  );

  router.get(
    '/aggregate',
    asyncHandler(async (req, res) => {
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const groupBy =
        (typeof req.query.groupBy === 'string' ? req.query.groupBy : 'component') as
          | 'component'
          | 'severity'
          | 'layer'
          | 'chain'
          | 'event';
      const result = await deps.logIntel.aggregate(query, groupBy);
      res.json(result);
    })
  );

  router.get(
    '/incidents',
    asyncHandler(async (req, res) => {
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const incidents = await deps.logIntel.incidents(query);
      res.json({ incidents });
    })
  );

  router.get(
    '/insights',
    asyncHandler(async (req, res) => {
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const report = await deps.logIntel.insights(query);
      res.json(report);
    })
  );

  router.get(
    '/correlation',
    asyncHandler(async (req, res) => {
      const query = LogIntelService.parseQueryParams(req.query as Record<string, string | string[] | undefined>);
      const data = await deps.logIntel.correlation(query);
      res.json(data);
    })
  );

  router.get(
    '/critical',
    requirePermission('observability:read'),
    asyncHandler(async (req, res) => {
      const limit = req.query.limit ? Number(req.query.limit) : 200;
      res.json({ records: deps.criticalStore?.list(limit) || [] });
    })
  );

  return router;
};
