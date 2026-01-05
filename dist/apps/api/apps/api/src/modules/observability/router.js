"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildObservabilityRouter = void 0;
const express_1 = require("express");
const rbac_1 = require("../../lib/rbac");
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const buildObservabilityRouter = (deps) => {
    const router = (0, express_1.Router)();
    router.get('/metrics', asyncHandler(async (req, res) => {
        const q = req.query.q || 'up';
        const rangeStart = req.query.rangeStart ? Number(req.query.rangeStart) : undefined;
        const rangeEnd = req.query.rangeEnd ? Number(req.query.rangeEnd) : undefined;
        const step = req.query.step ? Number(req.query.step) : undefined;
        const result = rangeStart && rangeEnd
            ? await deps.metrics.queryPrometheusRange(q, rangeStart, rangeEnd, step)
            : await deps.metrics.queryPrometheus(q);
        res.json(result);
    }));
    router.get('/dashboards', asyncHandler(async (_req, res) => {
        const dashboards = await deps.metrics.listDashboards();
        res.json(dashboards);
    }));
    router.get('/alerts', asyncHandler(async (_req, res) => {
        const alerts = await deps.alerts.list();
        res.json(alerts);
    }));
    router.post('/alerts', asyncHandler(async (req, res) => {
        if (deps.alertProxy) {
            const result = await deps.alertProxy(req.body);
            res.status(201).json(result);
            return;
        }
        const alert = await deps.alerts.create(req.body);
        res.status(201).json(alert);
    }));
    router.get('/guard/policy', (0, rbac_1.requirePermission)('guard:write'), asyncHandler(async (_req, res) => {
        if (!deps.guard) {
            res.status(404).json({ error: 'guard_not_configured' });
            return;
        }
        const policy = await deps.guard.listPolicies();
        res.json(policy);
    }));
    router.post('/guard/policy/:path', (0, rbac_1.requirePermission)('guard:write'), asyncHandler(async (req, res) => {
        if (!deps.guard) {
            res.status(404).json({ error: 'guard_not_configured' });
            return;
        }
        const path = req.params.path;
        const result = await deps.guard.setPolicy(path, req.body);
        res.json(result);
    }));
    router.get('/logs', asyncHandler(async (req, res) => {
        const q = req.query.q || '';
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const startMs = req.query.start ? Number(req.query.start) : undefined;
        const endMs = req.query.end ? Number(req.query.end) : undefined;
        const direction = req.query.direction || undefined;
        const events = await deps.logs.search(q, limit, startMs, endMs);
        res.setHeader('x-log-direction', direction || 'none');
        res.json(events);
    }));
    router.get('/logs/stream', asyncHandler(async (req, res) => {
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
        const stop = deps.logs.tail(req.query.q || '', (event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        });
        req.on('close', () => {
            stop?.();
        });
    }));
    router.get('/channels', asyncHandler(async (_req, res) => {
        const channels = await deps.notifications.listChannels();
        res.json(channels);
    }));
    return router;
};
exports.buildObservabilityRouter = buildObservabilityRouter;
