import { NextFunction, Request, Response, Router } from 'express';
import type {
  AlertRulesService,
  LogsService,
  MetricsService,
  NotificationRouterService,
  AuditLog
} from './services';
import { requirePermission } from '../../lib/rbac';
import type { AlertmanagerAlert } from '../../clients/alertmanager';

const asyncHandler =
  <TReq extends Request = Request, TRes extends Response = Response>(
    fn: (req: TReq, res: TRes, next: NextFunction) => Promise<unknown>
  ) =>
  (req: TReq, res: TRes, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export interface ObservabilityDeps {
  metrics: MetricsService;
  logs: LogsService;
  alerts: AlertRulesService;
  notifications: NotificationRouterService;
  auditLog?: AuditLog;
  guard?: {
    listPolicies: () => Promise<unknown>;
    setPolicy: (path: 'mode' | 'threshold' | 'delay', body: unknown) => Promise<unknown>;
  };
  alertProxy?: (payload: AlertmanagerAlert) => Promise<unknown>;
}

export const buildObservabilityRouter = (deps: ObservabilityDeps) => {
  const router = Router();

  router.get(
    '/metrics',
    asyncHandler(async (req, res) => {
      const q = (req.query.q as string) || 'up';
      const rangeStart = req.query.rangeStart ? Number(req.query.rangeStart) : undefined;
      const rangeEnd = req.query.rangeEnd ? Number(req.query.rangeEnd) : undefined;
      const step = req.query.step ? Number(req.query.step) : undefined;
      const result =
        rangeStart && rangeEnd
          ? await deps.metrics.queryPrometheusRange(q, rangeStart, rangeEnd, step)
          : await deps.metrics.queryPrometheus(q);
      res.json(result);
    })
  );

  router.get(
    '/dashboards',
    asyncHandler(async (_req, res) => {
      const dashboards = await deps.metrics.listDashboards();
      res.json(dashboards);
    })
  );

  router.get(
    '/alerts',
    asyncHandler(async (_req, res) => {
      const alerts = await deps.alerts.list();
      res.json(alerts);
    })
  );

  router.post(
    '/alerts',
    asyncHandler(async (req, res) => {
      if (deps.alertProxy) {
        const result = await deps.alertProxy(req.body);
        await deps.auditLog?.append({
          actorId: req.session.userId || 'unknown',
          action: 'alert:create',
          resource: 'alertmanager',
          meta: { correlationId: req.correlationId }
        });
        res.status(201).json(result);
        return;
      }
      const alert = await deps.alerts.create(req.body);
      await deps.auditLog?.append({
        actorId: req.session.userId || 'unknown',
        action: 'alert:create',
        resource: alert.id || 'alert',
        meta: { correlationId: req.correlationId }
      });
      res.status(201).json(alert);
    })
  );

  router.get(
    '/guard/policy',
    requirePermission('guard:write'),
    asyncHandler(async (req, res) => {
      if (!deps.guard) {
        res.status(404).json({ error: 'guard_not_configured' });
        return;
      }
      const policy = await deps.guard.listPolicies();
      await deps.auditLog?.append({
        actorId: req.session.userId || 'unknown',
        action: 'guard:policy:read',
        resource: 'guard',
        meta: { correlationId: req.correlationId }
      });
      res.json(policy);
    })
  );

  router.post(
    '/guard/policy/:path',
    requirePermission('guard:write'),
    asyncHandler(async (req, res) => {
      if (!deps.guard) {
        res.status(404).json({ error: 'guard_not_configured' });
        return;
      }
      const path = req.params.path as 'mode' | 'threshold' | 'delay';
      const result = await deps.guard.setPolicy(path, req.body);
      await deps.auditLog?.append({
        actorId: req.session.userId || 'unknown',
        action: 'guard:policy:update',
        resource: path,
        meta: { correlationId: req.correlationId }
      });
      res.json(result);
    })
  );

  router.get(
    '/logs',
    asyncHandler(async (req, res) => {
      const q = (req.query.q as string) || '';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const startMs = req.query.start ? Number(req.query.start) : undefined;
      const endMs = req.query.end ? Number(req.query.end) : undefined;
      const direction = (req.query.direction as 'older' | 'newer' | undefined) || undefined;
      const events = await deps.logs.search(q, limit, startMs, endMs);
      res.setHeader('x-log-direction', direction || 'none');
      res.json(events);
    })
  );

  router.get(
    '/logs/stream',
    asyncHandler(async (req, res) => {
      if (!deps.logs.tail) {
        res.status(501).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      const stop = deps.logs.tail((req.query.q as string) || '', (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
      req.on('close', () => {
        stop?.();
      });
    })
  );

  router.get(
    '/channels',
    asyncHandler(async (_req, res) => {
      const channels = await deps.notifications.listChannels();
      res.json(channels);
    })
  );

  return router;
};
