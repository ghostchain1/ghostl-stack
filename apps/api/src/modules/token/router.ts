import { Router } from 'express';
import { z } from 'zod';
import { JsonRpcProvider, Contract } from '@ghostchain/sdk';
import { requirePermission } from '../../lib/rbac';
import type { TokenService } from '../../services/token-store';
import type { WalletService } from '../../services/wallet-store';
import type { TokenRecord } from '@ghostchain/types';
import { ghostWalletRpcManager } from '../../services/rpc-manager';
import { assertMainchainId } from '@ghostchain/routing-guard';

const TOKEN_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const tokenImportSchema = z.object({
  address: z.string().regex(TOKEN_ADDRESS_REGEX, { message: 'invalid_address' }),
  chainId: z.string().min(1),
  type: z.enum(['erc20', 'erc721', 'erc1155']).optional(),
  rpc: z.string().optional()
});
const tokenListSchema = z.object({
  walletId: z.string().optional(),
  chainId: z.string().optional(),
  address: z.string().optional(),
  type: z.enum(['erc20', 'erc721', 'erc1155']).optional()
});

const logTokenEvent = (level: 'info' | 'warn' | 'error', event: string, meta: Record<string, unknown>) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...meta }));
};

const resolveRegistryRpc = (chainId: string, override?: string) => {
  const pool = ghostWalletRpcManager.getPoolSnapshot();
  const chainLabel = chainId.trim();
  const normalized = chainLabel.toLowerCase();
  let layer: 'L1' | 'L2' | 'L3' | null = null;
  if (normalized === 'l1') layer = 'L1';
  if (normalized === 'l2') layer = 'L2';
  if (normalized === 'l3') layer = 'L3';
  if (!layer) {
    const parsed = Number(chainLabel);
    if (Number.isFinite(parsed)) {
      // MAINCHAIN ENFORCEMENT: reject any numeric chain ID that isn't one of
      // GhostChain (14000101), GhostL2 (901), or GhostL3 (903).
      try {
        assertMainchainId(parsed);
      } catch {
        return { error: 'chain_unregistered' as const };
      }
      const match = (Object.entries(pool) as Array<[keyof typeof pool, typeof pool[keyof typeof pool]]>).find(
        ([, endpoints]) => endpoints.some((endpoint) => endpoint.chainId === parsed)
      );
      layer = match ? (match[0] as 'L1' | 'L2' | 'L3') : null;
    }
  }
  if (!layer) {
    return { error: 'chain_unregistered' as const };
  }
  const endpoints = pool[layer].filter((endpoint) => endpoint.protocol === 'http');
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

const verifyTokenStored = (tokens: TokenRecord[], token: TokenRecord) => {
  const address = token.address.toLowerCase();
  return tokens.some(
    (entry) =>
      entry.id === token.id ||
      (entry.address.toLowerCase() === address && entry.walletId === token.walletId && entry.chainId === token.chainId)
  );
};

export const buildTokenRouter = (tokens: TokenService, wallets: WalletService) => {
  const router = Router({ mergeParams: true });

  router.get(
    ['/api/tokens', '/tokens'],
    requirePermission('wallets:read'),
    async (req, res) => {
      const query = {
        walletId: typeof req.query.walletId === 'string' ? req.query.walletId : undefined,
        chainId: typeof req.query.chainId === 'string' ? req.query.chainId : undefined,
        address: typeof req.query.address === 'string' ? req.query.address : undefined,
        type: typeof req.query.type === 'string' ? req.query.type : undefined
      };
      const parsed = tokenListSchema.safeParse(query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const { walletId, chainId, address, type } = parsed.data;
      try {
        const list = await tokens.list(walletId);
        const filtered = list.filter((token) => {
          if (chainId && token.chainId !== chainId) return false;
          if (type && token.type !== type) return false;
          if (address && token.address.toLowerCase() !== address.toLowerCase()) return false;
          return true;
        });
        const walletList = await wallets.list();
        const walletMap = new Map(walletList.map((wallet) => [wallet.id, wallet]));
        const enriched = filtered.map((token) => {
          const wallet = token.walletId ? walletMap.get(token.walletId) : undefined;
          return {
            ...token,
            wallet: wallet
              ? {
                  id: wallet.id,
                  label: wallet.label,
                  address: wallet.address,
                  chainId: wallet.chainId,
                  type: wallet.type,
                  ownerUserId: wallet.ownerUserId,
                  status: wallet.status
                }
              : undefined
          };
        });
        if (!enriched.length) {
          logTokenEvent('warn', 'tokens.list.empty', {
            correlationId: req.correlationId,
            walletId,
            chainId,
            address,
            type
          });
        }
        res.json({
          ok: true,
          tokens: enriched,
          meta: { count: enriched.length, walletCount: walletList.length, filters: parsed.data }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'token_list_failed';
        logTokenEvent('error', 'tokens.list.failed', {
          correlationId: req.correlationId,
          walletId,
          chainId,
          address,
          type,
          error: message
        });
        res.status(500).json({ error: 'token_list_failed', message });
      }
    }
  );

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
      const targetChain = chainOverride || wallet.chainId;
      const normalizeChain = (chainId: string) => {
        if (chainId === 'l1' || chainId === 'L1') return 'l1' as const;
        if (chainId === 'l3' || chainId === 'L3') return 'l3' as const;
        return 'l2' as const;
      };
      let provider: JsonRpcProvider;
      try {
        provider = ghostWalletRpcManager.getProvider(normalizeChain(targetChain));
      } catch (err) {
        res.status(503).json({ error: 'rpc_unavailable', chain: targetChain, message: err instanceof Error ? err.message : 'rpc_unavailable' });
        return;
      }
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
      const parsed = tokenImportSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      const walletId = Array.isArray(req.params.walletId) ? req.params.walletId[0] : req.params.walletId;
      const resolvedRpc = resolveRegistryRpc(parsed.data.chainId, parsed.data.rpc);
      if ('error' in resolvedRpc) {
        logTokenEvent('error', 'tokens.import.rpc_rejected', {
          correlationId: req.correlationId,
          walletId,
          chainId: parsed.data.chainId,
          rpc: parsed.data.rpc,
          error: resolvedRpc.error
        });
        const status = resolvedRpc.error === 'rpc_unavailable' ? 503 : 400;
        res.status(status).json({ error: resolvedRpc.error, chainId: parsed.data.chainId });
        return;
      }
      try {
        const created = await tokens.importToken({ walletId, ...parsed.data, rpc: resolvedRpc.rpc });
        const stored = await tokens.list(walletId);
        const verified = verifyTokenStored(stored, created);
        logTokenEvent('info', 'tokens.imported', {
          correlationId: req.correlationId,
          walletId,
          tokenId: created.id,
          chainId: created.chainId,
          address: created.address,
          type: created.type,
          symbol: created.symbol,
          storedCount: stored.length,
          verified
        });
        if (!verified) {
          logTokenEvent('error', 'tokens.import.mismatch', {
            correlationId: req.correlationId,
            walletId,
            tokenId: created.id
          });
          res.status(500).json({ error: 'token_store_mismatch' });
          return;
        }
        res.status(201).json(created);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'token_import_failed';
        logTokenEvent('error', 'tokens.import.failed', {
          correlationId: req.correlationId,
          walletId,
          error: message
        });
        res.status(500).json({ error: 'token_import_failed', message });
      }
    }
  );

  router.delete(
    '/wallets/:walletId/tokens/:tokenId',
    requirePermission('wallets:write'),
    async (req, res) => {
      const tokenId = Array.isArray(req.params.tokenId) ? req.params.tokenId[0] : req.params.tokenId;
      try {
        await tokens.delete(tokenId);
        const stored = await tokens.list();
        const remaining = stored.find((token) => token.id === tokenId);
        if (remaining) {
          logTokenEvent('error', 'tokens.delete.mismatch', {
            correlationId: req.correlationId,
            walletId: req.params.walletId,
            tokenId
          });
          res.status(500).json({ error: 'token_delete_failed' });
          return;
        }
        logTokenEvent('info', 'tokens.deleted', {
          correlationId: req.correlationId,
          walletId: req.params.walletId,
          tokenId,
          remaining: stored.length
        });
        res.json({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'token_delete_failed';
        logTokenEvent('error', 'tokens.delete.failed', {
          correlationId: req.correlationId,
          walletId: req.params.walletId,
          tokenId,
          error: message
        });
        res.status(500).json({ error: 'token_delete_failed', message });
      }
    }
  );

  return router;
};
