"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildChainRouter = void 0;
const express_1 = require("express");
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const buildChainRouter = (deps) => {
    const router = (0, express_1.Router)();
    router.get('/status', asyncHandler(async (_req, res) => {
        const [info, epoch, blockTimeMs, finalityLag, reorgs] = await Promise.all([
            deps.status.getChainInfo(),
            deps.status.getEpochInfo(),
            deps.status.getBlockTimeMs(),
            deps.status.getFinalityLag(),
            deps.status.getReorgEvents(5)
        ]);
        res.json({ info, epoch, blockTimeMs, finalityLag, reorgs });
    }));
    router.get('/peers', asyncHandler(async (_req, res) => {
        const peers = await deps.peers.listPeers();
        const topology = await deps.peers.getTopology();
        res.json({ peers, topology });
    }));
    router.get('/telemetry', asyncHandler(async (_req, res) => {
        const [participation, latency, health] = await Promise.all([
            deps.telemetry.getParticipationRate(),
            deps.telemetry.getLatencyMetrics(),
            deps.telemetry.getHealthSummary()
        ]);
        res.json({ participation, latency, health });
    }));
    return router;
};
exports.buildChainRouter = buildChainRouter;
