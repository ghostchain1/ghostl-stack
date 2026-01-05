"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNodeRouter = void 0;
const express_1 = require("express");
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const buildNodeRouter = (deps) => {
    const router = (0, express_1.Router)();
    router.get('/', asyncHandler(async (_req, res) => {
        const nodes = await deps.inventory.list();
        res.json(nodes);
    }));
    router.get('/:id', asyncHandler(async (req, res) => {
        const node = await deps.inventory.get(req.params.id);
        if (!node) {
            res.status(404).json({ error: 'not_found' });
            return;
        }
        const metrics = await deps.health.getHealth(req.params.id);
        res.json({ node, metrics });
    }));
    router.get('/:id/logs', asyncHandler(async (req, res) => {
        const logs = await deps.health.getLogs(req.params.id, Number(req.query.tail) || 100);
        res.json(logs);
    }));
    return router;
};
exports.buildNodeRouter = buildNodeRouter;
