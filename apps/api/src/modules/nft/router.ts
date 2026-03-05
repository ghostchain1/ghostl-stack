import { Router } from 'express';
import { z } from 'zod';
import { Contract, Interface, JsonRpcProvider, Wallet, id as keccakId } from 'ghost';
import type { GhostWalletService } from '../../services/ghostwallet';
import type { WalletService } from '../../services/wallet-store';
import type { NftStore } from '../../services/nft-store';
import { requirePermission } from '../../lib/rbac';
import { env } from '../../config/env';
import { ghostWalletRpcManager } from '../../services/rpc-manager';

const erc721Iface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function mint(address to, string uri) returns (uint256)',
  'function mint(address to, uint256 tokenId, string uri)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function burn(uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)'
]);

const accessControlIface = new Interface(['function grantRole(bytes32 role, address account)', 'function revokeRole(bytes32 role, address account)']);

const normalizeChain = (chainId: 'l1' | 'l2' | 'l3') => {
  if (chainId === 'l1') return 'l1' as const;
  if (chainId === 'l3') return 'l3' as const;
  return 'l2' as const;
};

const resolveProvider = (chainId: 'l1' | 'l2' | 'l3', override?: string) => {
  if (!override) {
    return ghostWalletRpcManager.getProvider(normalizeChain(chainId));
  }
  const pool = ghostWalletRpcManager.getPoolSnapshot();
  const layerKey = chainId.toUpperCase() as 'L1' | 'L2' | 'L3';
  const allowed = pool[layerKey] || [];
  if (!allowed.find((endpoint) => endpoint.url === override)) {
    throw new Error('rpc_override_not_in_registry');
  }
  return new JsonRpcProvider(override);
};

const parseTransferEvent = (logs: { address?: string; topics?: string[]; data?: string }[], contract: string) => {
  for (const log of logs) {
    if (!log.address || log.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const parsed = erc721Iface.parseLog({ topics: log.topics || [], data: log.data || '' });
      if (parsed?.name === 'Transfer') {
        return {
          from: String(parsed.args.from),
          to: String(parsed.args.to),
          tokenId: String(parsed.args.tokenId)
        };
      }
    } catch {
      // ignore non-ERC721 logs
    }
  }
  return null;
};

const sendAdminTx = async (provider: JsonRpcProvider, to: string, data: string) => {
  if (!env.CONTRACT_ADMIN_KEY) {
    throw new Error('contract admin key not configured');
  }
  const wallet = new Wallet(env.CONTRACT_ADMIN_KEY, provider);
  const tx = await wallet.sendTransaction({ to, data });
  return tx.hash;
};

export const buildNftRouter = (store: NftStore, ghostWallet: GhostWalletService, wallets: WalletService) => {
  const router = Router();

  router.get('/nfts/contracts', requirePermission('wallets:read'), async (_req, res) => {
    const contracts = await store.listContracts();
    res.json({ ok: true, contracts });
  });

  router.post('/nfts/contracts', requirePermission('contracts:write'), async (req, res) => {
    const schema = z.object({
      address: z.string(),
      chainId: z.enum(['l1', 'l2', 'l3']),
      name: z.string().optional(),
      symbol: z.string().optional(),
      standard: z.enum(['erc721']).optional(),
      metadataUri: z.string().optional(),
      rpc: z.string().url().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const payload = parsed.data;
    let name = payload.name;
    let symbol = payload.symbol;
    if (!name || !symbol) {
      try {
        const provider = resolveProvider(payload.chainId, payload.rpc);
        const contract = new Contract(payload.address, erc721Iface.fragments, provider);
        const [fetchedName, fetchedSymbol] = await Promise.all([
          name ? Promise.resolve(name) : contract.name(),
          symbol ? Promise.resolve(symbol) : contract.symbol()
        ]);
        name = fetchedName;
        symbol = fetchedSymbol;
      } catch {
        // ignore metadata fetch errors
      }
    }
    const contract = await store.registerContract({
      address: payload.address,
      chainId: payload.chainId,
      standard: payload.standard || 'erc721',
      name,
      symbol,
      metadataUri: payload.metadataUri
    });
    res.status(201).json({ ok: true, contract });
  });

  router.get('/nfts/contracts/:id/tokens', requirePermission('wallets:read'), async (req, res) => {
    const contractId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined;
    if (!contractId) {
      res.status(400).json({ error: 'contractId required' });
      return;
    }
    const tokens = await store.listTokens({ contractId, owner });
    res.json({ ok: true, tokens });
  });

  router.post('/nfts/minters', requirePermission('contracts:write'), async (req, res) => {
    const schema = z.object({
      contractId: z.string().optional(),
      address: z.string().optional(),
      chainId: z.enum(['l1', 'l2', 'l3']).optional(),
      account: z.string(),
      action: z.enum(['grant', 'revoke']),
      rpc: z.string().url().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { contractId, address, chainId, account, action, rpc } = parsed.data;
    const contract = contractId ? await store.getContract(contractId) : null;
    const resolvedAddress = address || contract?.address;
    const resolvedChain = chainId || contract?.chainId;
    if (!resolvedAddress || !resolvedChain) {
      res.status(400).json({ error: 'contractId or address+chainId required' });
      return;
    }
    if (resolvedChain !== 'l1' && resolvedChain !== 'l2' && resolvedChain !== 'l3') {
      res.status(400).json({ error: 'invalid_chain' });
      return;
    }
    const role = keccakId('MINTER_ROLE');
    const data =
      action === 'grant'
        ? accessControlIface.encodeFunctionData('grantRole', [role, account])
        : accessControlIface.encodeFunctionData('revokeRole', [role, account]);
    try {
      const provider = resolveProvider(resolvedChain, rpc);
      const txHash = await sendAdminTx(provider, resolvedAddress, data);
      res.json({ ok: true, txHash });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/nfts/mint', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      contractId: z.string().optional(),
      address: z.string().optional(),
      chainId: z.enum(['l1', 'l2', 'l3']).optional(),
      walletId: z.string(),
      to: z.string(),
      tokenUri: z.string().optional(),
      tokenId: z.union([z.string(), z.number().int()]).optional(),
      rpc: z.string().url().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { contractId, address, chainId, walletId, to, tokenUri, tokenId, rpc } = parsed.data;
    const contract = contractId ? await store.getContract(contractId) : null;
    const resolvedAddress = address || contract?.address;
    const resolvedChain = chainId || (contract?.chainId as 'l1' | 'l2' | 'l3' | undefined);
    if (!resolvedAddress || !resolvedChain) {
      res.status(400).json({ error: 'contractId or address+chainId required' });
      return;
    }
    const data = tokenId
      ? erc721Iface.encodeFunctionData('mint(address,uint256,string)', [to, tokenId, tokenUri || ''])
      : erc721Iface.encodeFunctionData('mint(address,string)', [to, tokenUri || '']);
    try {
      const txResult = await ghostWallet.sendTransaction({
        walletId,
        chainId: resolvedChain,
        to: resolvedAddress,
        amount: '0',
        data
      });
      const provider = resolveProvider(resolvedChain, rpc);
      const receipt = await provider.waitForTransaction(txResult.tx, 1, 120_000);
      const transfer = receipt ? parseTransferEvent(receipt.logs as any[], resolvedAddress) : null;
      const mintedTokenId = transfer?.tokenId || (tokenId !== undefined ? String(tokenId) : undefined);
      if (!mintedTokenId) {
        res.status(202).json({ ok: true, tx: txResult.tx, token: null });
        return;
      }
      const contractKey = contract?.id || store.contractKey(resolvedChain, resolvedAddress);
      const tokenRecord = await store.upsertToken({
        id: store.tokenKey(contractKey, mintedTokenId),
        contractId: contractKey,
        contractAddress: resolvedAddress,
        chainId: resolvedChain,
        tokenId: mintedTokenId,
        owner: to,
        uri: tokenUri,
        mintedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastTx: txResult.tx
      });
      res.json({ ok: true, tx: txResult.tx, token: tokenRecord });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/nfts/transfer', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      contractId: z.string().optional(),
      address: z.string().optional(),
      chainId: z.enum(['l1', 'l2', 'l3']).optional(),
      walletId: z.string(),
      to: z.string(),
      tokenId: z.union([z.string(), z.number().int()])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { contractId, address, chainId, walletId, to, tokenId } = parsed.data;
    const contract = contractId ? await store.getContract(contractId) : null;
    const resolvedAddress = address || contract?.address;
    const resolvedChain = chainId || (contract?.chainId as 'l1' | 'l2' | 'l3' | undefined);
    if (!resolvedAddress || !resolvedChain) {
      res.status(400).json({ error: 'contractId or address+chainId required' });
      return;
    }
    const wallet = await wallets.get(walletId);
    if (!wallet) {
      res.status(404).json({ error: 'wallet_not_found' });
      return;
    }
    const from = wallet.address;
    const data = erc721Iface.encodeFunctionData('safeTransferFrom(address,address,uint256)', [from, to, tokenId]);
    try {
      const txResult = await ghostWallet.sendTransaction({
        walletId,
        chainId: resolvedChain,
        to: resolvedAddress,
        amount: '0',
        data
      });
      const contractKey = contract?.id || store.contractKey(resolvedChain, resolvedAddress);
      await store.markTransfer(contractKey, String(tokenId), to, txResult.tx);
      res.json({ ok: true, tx: txResult.tx, from, to, tokenId: String(tokenId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post('/nfts/burn', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      contractId: z.string().optional(),
      address: z.string().optional(),
      chainId: z.enum(['l1', 'l2', 'l3']).optional(),
      walletId: z.string(),
      tokenId: z.union([z.string(), z.number().int()])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { contractId, address, chainId, walletId, tokenId } = parsed.data;
    const contract = contractId ? await store.getContract(contractId) : null;
    const resolvedAddress = address || contract?.address;
    const resolvedChain = chainId || (contract?.chainId as 'l1' | 'l2' | 'l3' | undefined);
    if (!resolvedAddress || !resolvedChain) {
      res.status(400).json({ error: 'contractId or address+chainId required' });
      return;
    }
    const data = erc721Iface.encodeFunctionData('burn(uint256)', [tokenId]);
    try {
      const txResult = await ghostWallet.sendTransaction({
        walletId,
        chainId: resolvedChain,
        to: resolvedAddress,
        amount: '0',
        data
      });
      const contractKey = contract?.id || store.contractKey(resolvedChain, resolvedAddress);
      await store.markBurned(contractKey, String(tokenId), txResult.tx);
      res.json({ ok: true, tx: txResult.tx, tokenId: String(tokenId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get('/nfts/owners/:address', requirePermission('wallets:read'), async (req, res) => {
    const owner = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
    if (!owner) {
      res.status(400).json({ error: 'owner required' });
      return;
    }
    const tokens = await store.listTokens({ owner });
    res.json({ ok: true, tokens });
  });

  return router;
};
