import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../lib/rbac';
import type { WalletService } from '../../services/wallet-store';

export const buildWalletAdminRouter = (wallets: WalletService) => {
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

  router.get('/wallets', requirePermission('wallets:read'), async (_req, res) => {
    const data = await wallets.list();
    res.json(data);
  });

  router.get('/wallets/:id', requirePermission('wallets:read'), async (req, res) => {
    const wallet = await wallets.get(req.params.id);
    if (!wallet) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(wallet);
  });

  router.post('/wallets', requirePermission('wallets:write'), async (req, res) => {
    const parsed = watchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const created = await wallets.createWatch(parsed.data);
    res.status(201).json(created);
  });

  router.post('/wallets/import', requirePermission('wallets:write'), async (req, res) => {
    const parsed = watchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const created = await wallets.importWatch(parsed.data);
    res.status(201).json(created);
  });

  router.post('/wallets/custodial', requirePermission('wallets:write'), async (req, res) => {
    const parsed = watchSchema.omit({ address: true }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const created = await wallets.createCustodial(parsed.data);
    res.status(201).json(created);
  });

  router.post('/wallets/:id/rotate', requirePermission('wallets:write'), async (req, res) => {
    try {
      const rotated = await wallets.rotateCustodial(req.params.id);
      res.json(rotated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.patch('/wallets/:id', requirePermission('wallets:write'), async (req, res) => {
    try {
      const updated = await wallets.update(req.params.id, req.body || {});
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete('/wallets/:id', requirePermission('wallets:write'), async (req, res) => {
    await wallets.delete(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
