import { Router } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';

export const buildWalletRouter = () => {
  const router = Router();

  router.post('/bridge', async (req, res) => {
    const schema = z.object({
      fromRpc: z.string(),
      toRpc: z.string(),
      token: z.string().optional(),
      to: z.string(),
      amount: z.string(),
      privateKey: z.string()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { fromRpc, token, to, amount, privateKey } = parsed.data;
    try {
      const signer = new ethers.Wallet(privateKey, new ethers.JsonRpcProvider(fromRpc));
      let tx;
      if (token) {
        const erc20 = new ethers.Contract(
          token,
          ['function transfer(address to, uint256 amount) returns (bool)'],
          signer
        );
        tx = await erc20.transfer(to, amount);
      } else {
        tx = await signer.sendTransaction({ to, value: amount });
      }
      await tx.wait();
      res.json({ tx: tx.hash });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
};
