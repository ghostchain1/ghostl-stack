import { Router } from 'express';
import { z } from 'zod';
import { JsonRpcProvider, Contract } from 'ethers';
import { requirePermission } from '../../lib/rbac';
import type { TokenService } from '../../services/token-store';
import type { WalletService } from '../../services/wallet-store';
import { env } from '../../config/env';

export const buildTokenRouter = (tokens: TokenService, wallets: WalletService) => {
  const router = Router({ mergeParams: true });

  router.get(
    '/wallets/:walletId/tokens',
    requirePermission('wallets:read'),
    async (req, res) => {
      const walletId = Array.isArray(req.params.walletId) ? req.params.walletId[0] : req.params.walletId;
      const list = await tokens.list(walletId);
      res.json(list);
    }
  );

  router.get(
    '/wallets/:walletId/balances',
    requirePermission('wallets:read'),
    async (req, res) => {
      const walletId = Array.isArray(req.params.walletId) ? req.params.walletId[0] : req.params.walletId;
      const wallet = await wallets.get(walletId);
      if (!wallet) {
        res.status(404).json({ error: 'wallet_not_found' });
        return;
      }
      const chainOverride = typeof req.query.chain === 'string' ? req.query.chain : undefined;
      const tokenList = await tokens.list(wallet.id);
      const rpcFor = (chainId: string) => {
        if (chainId === 'l1') return env.RPC_L1 || env.EXPLORER_RPC_URL || 'http://localhost:18545';
        if (chainId === 'l3') return env.RPC_L3 || env.EXPLORER_RPC_URL || 'http://localhost:39545';
        return env.RPC_L2 || env.EXPLORER_RPC_URL || 'http://localhost:18547';
      };
      const targetChain = chainOverride || wallet.chainId;
      const provider = new JsonRpcProvider(rpcFor(targetChain));
      const balances = [];
      const nativeBalance = await provider.getBalance(wallet.address).catch(() => null);
      if (nativeBalance) {
        balances.push({ type: 'native', chainId: targetChain, address: wallet.address, balance: nativeBalance.toString() });
      }
      for (const t of tokenList) {
        if (t.type === 'erc20') {
          try {
            const contract = new Contract(t.address, ['function balanceOf(address) view returns (uint256)'], provider);
            const bal = await contract.balanceOf(wallet.address);
            balances.push({ ...t, chainId: targetChain, balance: bal.toString() });
          } catch {
            balances.push({ ...t, chainId: targetChain, balance: null, error: 'rpc_error' });
          }
        }
      }
      res.json({ balances, chain: targetChain });
    }
  );

  router.post(
    '/wallets/:walletId/tokens/import',
    requirePermission('wallets:write'),
    async (req, res) => {
      const schema = z.object({
        address: z.string(),
        chainId: z.string(),
        type: z.enum(['erc20', 'erc721', 'erc1155']).optional(),
        rpc: z.string().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const walletId = Array.isArray(req.params.walletId) ? req.params.walletId[0] : req.params.walletId;
      const created = await tokens.importToken({ walletId, ...parsed.data });
      res.status(201).json(created);
    }
  );

  router.delete(
    '/wallets/:walletId/tokens/:tokenId',
    requirePermission('wallets:write'),
    async (req, res) => {
      const tokenId = Array.isArray(req.params.tokenId) ? req.params.tokenId[0] : req.params.tokenId;
      await tokens.delete(tokenId);
      res.json({ ok: true });
    }
  );

  return router;
};
