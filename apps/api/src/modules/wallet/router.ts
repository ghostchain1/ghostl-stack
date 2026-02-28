import { Router } from 'express';
import { z } from 'zod';
import { ethers } from 'ethers';
import type { GhostWalletService } from '../../services/ghostwallet';
import { requirePermission } from '../../lib/rbac';
import { ghostWalletRpcManager } from '../../services/rpc-manager';
import { assertRoutingLaw } from '@ghostl/routing-law';

export const buildWalletRouter = (ghostWallet: GhostWalletService) => {
  const router = Router();

  const resolveRegistryRpc = (chainId?: string, override?: string) => {
    const pool = ghostWalletRpcManager.getPoolSnapshot();
    const normalized = (chainId || '').trim().toLowerCase();
    let layer: 'L1' | 'L2' | 'L3' | null = null;
    if (normalized === 'l1') layer = 'L1';
    if (normalized === 'l2') layer = 'L2';
    if (normalized === 'l3') layer = 'L3';
    const allLayers: Array<'L1' | 'L2' | 'L3'> = ['L1', 'L2', 'L3'];
    if (!layer && override) {
      const match = allLayers.find((key) => (pool[key] || []).some((endpoint) => endpoint.url === override));
      layer = match || null;
    }
    if (!layer) {
      layer = 'L2';
    }
    const endpoints = (pool[layer] || []).filter((endpoint) => endpoint.protocol === 'http');
    if (!endpoints.length) {
      return { error: 'rpc_unavailable' as const, layer };
    }
    if (override) {
      const match = endpoints.find((endpoint) => endpoint.url === override);
      if (!match) {
        return { error: 'rpc_override_not_in_registry' as const, layer };
      }
      return { rpc: match.url, layer };
    }
    const order = { OK: 0, DEGRADED: 1, DOWN: 2 } as const;
    const preferred = [...endpoints].sort((a, b) => order[a.status] - order[b.status])[0];
    return { rpc: preferred.url, layer };
  };

  router.get('/token/balance', requirePermission('wallets:read'), async (req, res) => {
    const schema = z.object({
      rpc: z.string().optional(),
      chainId: z.string().optional(),
      address: z.string(),
      token: z.string().optional()
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { rpc, chainId, address, token } = parsed.data;
    const resolved = resolveRegistryRpc(chainId, rpc);
    if ('error' in resolved) {
      const status = resolved.error === 'rpc_unavailable' ? 503 : 400;
      res.status(status).json({ error: resolved.error, chainId: chainId || resolved.layer });
      return;
    }
    try {
      if (token) {
        const erc20 = new ethers.Contract(
          token,
          ['function balanceOf(address) view returns (uint256)'],
          new ethers.JsonRpcProvider(resolved.rpc)
        );
        const bal = await erc20.balanceOf(address);
        res.json({ address, token, balance: bal.toString() });
      } else {
        const provider = new ethers.JsonRpcProvider(resolved.rpc);
        const bal = await provider.getBalance(address);
        res.json({ address, balance: bal.toString() });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/send', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      walletId: z.string(),
      chainId: z.enum(['l1', 'l2', 'l3']),
      token: z.string().optional(),
      to: z.string(),
      amount: z.string(),
      gasPrice: z.string().optional(),
      gasLimit: z.string().optional(),
      maxFeePerGas: z.string().optional(),
      maxPriorityFeePerGas: z.string().optional(),
      data: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const result = await ghostWallet.sendTransaction(parsed.data);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/fund', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      walletId: z.string(),
      chainId: z.enum(['l1', 'l2', 'l3']).optional(),
      amount: z.string(),
      data: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const result = await ghostWallet.fundWallet(parsed.data);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.get('/tx/receipt', requirePermission('wallets:read'), async (req, res) => {
    const schema = z.object({
      chainId: z.enum(['l1', 'l2', 'l3']),
      tx: z.string()
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const txHash = parsed.data.tx;
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      res.status(400).json({ error: 'invalid_tx_hash' });
      return;
    }
    try {
      const result = await ghostWallet.getTransactionReceipt(parsed.data.chainId, txHash);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/sign-message', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      walletId: z.string(),
      message: z.string()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const signature = await ghostWallet.signMessage(parsed.data.walletId, parsed.data.message);
      res.json({ signature });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/sign-transaction', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      walletId: z.string(),
      chainId: z.enum(['l1', 'l2', 'l3']),
      to: z.string().optional(),
      value: z.string().optional(),
      data: z.string().optional(),
      gasLimit: z.string().optional(),
      gasPrice: z.string().optional(),
      maxFeePerGas: z.string().optional(),
      maxPriorityFeePerGas: z.string().optional(),
      nonce: z.number().int().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const signed = await ghostWallet.signTransaction(parsed.data);
      res.json(signed);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/bridge', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      walletId: z.string(),
      fromChain: z.enum(['l1', 'l2', 'l3']),
      toChain: z.enum(['l1', 'l2', 'l3']).optional(),
      token: z.string().optional(),
      to: z.string(),
      amount: z.string(),
      gasPrice: z.string().optional(),
      gasLimit: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const targetChain = parsed.data.toChain || (parsed.data.fromChain === 'l3' ? 'l2' : parsed.data.fromChain === 'l2' ? 'l1' : 'l1');
    try {
      assertRoutingLaw({
        sourceLayer: parsed.data.fromChain.toUpperCase(),
        targetLayer: targetChain.toUpperCase(),
        intent: 'wallet_bridge'
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          event: 'routing_law_blocked',
          intent: 'wallet_bridge',
          source: parsed.data.fromChain,
          target: targetChain,
          correlationId: req.correlationId,
          error: error instanceof Error ? error.message : 'routing_law_violation'
        })
      );
      res.status(400).json({ error: 'routing_law_violation', details: error instanceof Error ? error.message : undefined });
      return;
    }
    try {
      const result = await ghostWallet.sendTransaction({
        walletId: parsed.data.walletId,
        chainId: parsed.data.fromChain,
        token: parsed.data.token,
        to: parsed.data.to,
        amount: parsed.data.amount,
        gasPrice: parsed.data.gasPrice,
        gasLimit: parsed.data.gasLimit
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post('/swap', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      walletId: z.string(),
      chainId: z.enum(['l1', 'l2', 'l3']),
      tokenIn: z.string(),
      tokenOut: z.string(),
      amountIn: z.string(),
      recipient: z.string()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { chainId, tokenIn, tokenOut, amountIn, recipient } = parsed.data;
    if (tokenIn !== tokenOut) {
      res.status(400).json({ error: 'swap routing not implemented; tokenIn must equal tokenOut for passthrough transfer' });
      return;
    }
    try {
      const result = await ghostWallet.sendTransaction({
        walletId: parsed.data.walletId,
        chainId,
        token: tokenIn,
        to: recipient,
        amount: amountIn
      });
      res.json({ ...result, note: 'passthrough transfer swap' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return router;
};
