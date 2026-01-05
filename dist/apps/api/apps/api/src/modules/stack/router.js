"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStackRouter = void 0;
const express_1 = require("express");
const parsePromValue = (value) => {
    if (!value)
        return undefined;
    const parsed = parseFloat(value[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const queryNumber = async (client, q) => {
    try {
        const res = await client.query(q);
        return parsePromValue(res[0]?.value);
    }
    catch {
        return undefined;
    }
};
const buildStackRouter = (deps) => {
    const router = (0, express_1.Router)();
    router.get('/overview', async (req, res) => {
        const chain = req.query.chain || 'l2';
        const headQuery = `op_gate_head_block{chain="${chain}"}`;
        const finalizedQuery = `op_gate_finalized_block{chain="${chain}"}`;
        const head = await queryNumber(deps.prometheus, headQuery);
        const finalized = await queryNumber(deps.prometheus, finalizedQuery);
        const lag = head !== undefined && finalized !== undefined ? head - finalized : undefined;
        const relayerFinalized = await queryNumber(deps.prometheus, 'ghost_relayer_finalized_total');
        const relayerErrors = await queryNumber(deps.prometheus, 'ghost_relayer_errors_total');
        const guardAlerts = await queryNumber(deps.prometheus, 'ghost_guard_alerts_total');
        const guardDeposits = await queryNumber(deps.prometheus, 'ghost_guard_deposits_seen_total');
        let guardActiveAlerts = [];
        if (deps.guard) {
            try {
                guardActiveAlerts = (await deps.guard.listAlerts());
            }
            catch {
                // ignore
            }
        }
        let relayerHealth = null;
        if (deps.relayer) {
            try {
                relayerHealth = await deps.relayer.health();
            }
            catch {
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
exports.buildStackRouter = buildStackRouter;
