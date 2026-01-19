import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../lib/rbac';
import type { WalletService } from '../../services/wallet-store';
import type { WalletRecord } from '@ghostl/types';
import type { GhostWalletService } from '../../services/ghostwallet';

export const buildWalletAdminRouter = (wallets: WalletService, ghostWallet: GhostWalletService) => {
  const router = Router();

  const watchSchema = z.object({
    label: z.string(),
    address: z.string(),
    chainId: z.string(),
    ownerUserId: z.string().optional(),
    policy: z
      .object({
        dailyLimit: z.string().optional(),
        weeklyLimit: z.string().optional(),
        allowlist: z.array(z.string()).optional(),
        denylist: z.array(z.string()).optional(),
        approvalsRequired: z.number().int().optional()
      })
      .optional()
  });

  const sanitize = (wallet: WalletRecord) => {
    const {
      encryptedKey: _encryptedKey,
      encryptedMnemonic: _encryptedMnemonic,
      derivationPath: _derivationPath,
      keyType: _keyType,
      ...safe
    } = wallet;
    return safe;
  };

  router.get('/', requirePermission('wallets:read'), async (_req, res) => {
    const data = await wallets.list();
    res.json(data.map((w) => sanitize(w)));
  });

  router.get('/:id', requirePermission('wallets:read'), async (req, res) => {
    const walletId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const wallet = await wallets.get(walletId);
    if (!wallet) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(sanitize(wallet));
  });

  router.post('/', requirePermission('wallets:write'), async (req, res) => {
    const parsed = watchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const created = await wallets.createWatch(parsed.data);
    res.status(201).json(created);
  });

  router.post('/import', requirePermission('wallets:write'), async (req, res) => {
    const parsed = watchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const created = await wallets.importWatch(parsed.data);
    res.status(201).json(sanitize(created));
  });

  router.post('/custodial', requirePermission('wallets:write'), async (req, res) => {
    const parsed = watchSchema
      .omit({ address: true })
      .extend({
        ownerUserId: z.string().optional()
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const ownerUserId = parsed.data.ownerUserId || req.session.userId;
    if (!ownerUserId) {
      res.status(400).json({ error: 'ownerUserId required' });
      return;
    }
    const created = await ghostWallet.createWallet({
      userId: ownerUserId,
      label: parsed.data.label,
      chainId: parsed.data.chainId as 'l1' | 'l2' | 'l3'
    });
    res.status(201).json(sanitize(created.wallet));
  });

  router.post('/ghost/import', requirePermission('wallets:write'), async (req, res) => {
    const schema = z.object({
      label: z.string(),
      chainId: z.enum(['l1', 'l2', 'l3']),
      ownerUserId: z.string().optional(),
      mnemonic: z.string().optional(),
      privateKey: z.string().optional(),
      derivationPath: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const ownerUserId = parsed.data.ownerUserId || req.session.userId;
    if (!ownerUserId) {
      res.status(400).json({ error: 'ownerUserId required' });
      return;
    }
    try {
      const created = await ghostWallet.importWallet({
        userId: ownerUserId,
        label: parsed.data.label,
        chainId: parsed.data.chainId,
        mnemonic: parsed.data.mnemonic,
        privateKey: parsed.data.privateKey,
        derivationPath: parsed.data.derivationPath
      });
      res.status(201).json(sanitize(created.wallet));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/:id/rotate', requirePermission('wallets:write'), async (req, res) => {
    try {
      const walletId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const rotated = await ghostWallet.rotateWallet(walletId);
      res.json(sanitize(rotated.wallet));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/:id', requirePermission('wallets:write'), async (req, res) => {
    try {
      const walletId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await wallets.update(walletId, req.body || {});
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/:id', requirePermission('wallets:write'), async (req, res) => {
    const walletId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await wallets.delete(walletId);
    res.json({ ok: true });
  });

  return router;
};
