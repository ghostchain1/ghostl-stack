"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWalletRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const ethers_1 = require("ethers");
const buildWalletRouter = () => {
    const router = (0, express_1.Router)();
    router.post('/bridge', async (req, res) => {
        const schema = zod_1.z.object({
            fromRpc: zod_1.z.string(),
            toRpc: zod_1.z.string(),
            token: zod_1.z.string().optional(),
            to: zod_1.z.string(),
            amount: zod_1.z.string(),
            privateKey: zod_1.z.string()
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.message });
            return;
        }
        const { fromRpc, token, to, amount, privateKey } = parsed.data;
        try {
            const signer = new ethers_1.ethers.Wallet(privateKey, new ethers_1.ethers.JsonRpcProvider(fromRpc));
            let tx;
            if (token) {
                const erc20 = new ethers_1.ethers.Contract(token, ['function transfer(address to, uint256 amount) returns (bool)'], signer);
                tx = await erc20.transfer(to, amount);
            }
            else {
                tx = await signer.sendTransaction({ to, value: amount });
            }
            await tx.wait();
            res.json({ tx: tx.hash });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    return router;
};
exports.buildWalletRouter = buildWalletRouter;
