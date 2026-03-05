import { Router } from 'express';
import { JsonRpcProvider } from 'ghost';
import { requirePermission } from '../../lib/rbac';
import { ghostWalletRpcManager } from '../../services/rpc-manager';

type ChainId = 'l1' | 'l2' | 'l3';

type ChainConfig = {
  id: ChainId;
  label: string;
};

const rpcCall = async <T>(provider: JsonRpcProvider, method: string, params: unknown[] = []) => {
  return provider.send(method, params) as Promise<T>;
};

const checkChain = async (cfg: ChainConfig) => {
  const provider = ghostWalletRpcManager.getProvider(cfg.id);
  const [blockNumber, netVersion, syncing] = await Promise.all([
    provider.getBlockNumber(),
    rpcCall<string>(provider, 'eth_chainId'),
    rpcCall<{ startingBlock?: string; currentBlock?: string; highestBlock?: string } | boolean>(provider, 'eth_syncing').catch(() => false)
  ]);
  return {
    id: cfg.id,
    label: cfg.label,
    chainIdHex: netVersion,
    block: blockNumber,
    syncing
  };
};

export const buildGhostchainRouter = (chains: ChainConfig[]) => {
  const router = Router();

  router.get(
    '/ghostchain/health',
    requirePermission('chain:read'),
    async (_req, res) => {
      try {
        const results = await Promise.all(
          chains.map((c) =>
            checkChain(c).catch((err) => ({ id: c.id, label: c.label, error: (err as Error).message }))
          )
        );
        res.json({ ok: true, results });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  );

  return router;
};
