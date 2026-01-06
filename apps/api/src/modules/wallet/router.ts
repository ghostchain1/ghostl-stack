import { Router } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';

export const buildWalletRouter = () => {
  const router = Router();

  const makeSigner = (rpc: string, pk: string) => new ethers.Wallet(pk, new ethers.JsonRpcProvider(rpc));

  router.get('/token/balance', async (req, res) => {
    const schema = z.object({
      rpc: z.string(),
      address: z.string(),
      token: z.string().optional()
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { rpc, address, token } = parsed.data;
    try {
      if (token) {
        const erc20 = new ethers.Contract(token, ['function balanceOf(address) view returns (uint256)'], new ethers.JsonRpcProvider(rpc));
        const bal = await erc20.balanceOf(address);
        res.json({ address, token, balance: bal.toString() });
      } else {
        const provider = new ethers.JsonRpcProvider(rpc);
        const bal = await provider.getBalance(address);
        res.json({ address, balance: bal.toString() });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/send', async (req, res) => {
    const schema = z.object({
      rpc: z.string(),
      token: z.string().optional(),
      to: z.string(),
      amount: z.string(),
      privateKey: z.string(),
      gasPrice: z.string().optional(),
      gasLimit: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { rpc, token, to, amount, privateKey, gasPrice, gasLimit } = parsed.data;
    try {
      const signer = makeSigner(rpc, privateKey);
      let tx;
      if (token) {
        const erc20 = new ethers.Contract(
          token,
          ['function transfer(address to, uint256 amount) returns (bool)'],
          signer
        );
        tx = await erc20.transfer(to, amount, {
          gasPrice,
          gasLimit
        });
      } else {
        tx = await signer.sendTransaction({
          to,
          value: amount,
          gasPrice,
          gasLimit
        });
      }
      await tx.wait();
      res.json({ tx: tx.hash });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

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
      const signer = makeSigner(fromRpc, privateKey);
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

  router.post('/swap', async (req, res) => {
    const schema = z.object({
      rpc: z.string(),
      tokenIn: z.string(),
      tokenOut: z.string(),
      amountIn: z.string(),
      recipient: z.string(),
      privateKey: z.string()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { rpc, tokenIn, tokenOut, amountIn, recipient, privateKey } = parsed.data;
    if (tokenIn !== tokenOut) {
      res.status(400).json({ error: 'swap routing not implemented; tokenIn must equal tokenOut for passthrough transfer' });
      return;
    }
    try {
      const signer = makeSigner(rpc, privateKey);
      const erc20 = new ethers.Contract(
        tokenIn,
        ['function transfer(address to, uint256 amount) returns (bool)'],
        signer
      );
      const tx = await erc20.transfer(recipient, amountIn);
      await tx.wait();
      res.json({ tx: tx.hash, note: 'passthrough transfer swap' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
};
