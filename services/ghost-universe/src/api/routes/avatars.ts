import { Router } from 'express';
import { AvatarEngine } from '../../avatar/AvatarEngine.js';

export function avatarsRouter(avatars: AvatarEngine): Router {
  const router = Router();

  /** POST /avatars — create avatar */
  router.post('/', async (req, res) => {
    const { userAddress, modelUri, format } = req.body as {
      userAddress?: string; modelUri?: string; format?: 'vrm' | 'glb' | 'ghost3d';
    };
    if (!userAddress || !modelUri) {
      res.status(400).json({ error: 'userAddress and modelUri required' });
      return;
    }
    const result = avatars.createAvatar(userAddress, { uri: modelUri, format: format ?? 'ghost3d' });
    res.status(201).json(result);
  });

  /** GET /avatars/:id */
  router.get('/:id', (req, res) => {
    const avatar = avatars.getAvatar(req.params.id);
    if (!avatar) { res.status(404).json({ error: 'Avatar not found' }); return; }
    res.json({ avatar });
  });

  /** PATCH /avatars/:id/position */
  router.patch('/:id/position', (req, res) => {
    const { x, y, z } = req.body as { x?: number; y?: number; z?: number };
    if (x === undefined || y === undefined || z === undefined) {
      res.status(400).json({ error: 'x, y, z required' });
      return;
    }
    avatars.moveAvatar(req.params.id, { x, y, z, worldId: (req.query.worldId as string) ?? 'default' });
    res.json({ ok: true });
  });

  /** POST /avatars/:id/gesture */
  router.post('/:id/gesture', (req, res) => {
    const { gestureId, worldId } = req.body as { gestureId?: string; worldId?: string };
    if (!gestureId || !worldId) {
      res.status(400).json({ error: 'gestureId and worldId required' });
      return;
    }
    const avatar = avatars.getAvatar(req.params.id);
    if (!avatar) { res.status(404).json({ error: 'Avatar not found' }); return; }
    avatars.gestures.trigger(req.params.id, gestureId as never, worldId);
    res.json({ ok: true });
  });

  /** POST /avatars/:id/xp */
  router.post('/:id/xp', (req, res) => {
    const { amount } = req.body as { amount?: number };
    if (!amount || amount <= 0) { res.status(400).json({ error: 'positive amount required' }); return; }
    avatars.grantXP(req.params.id, BigInt(amount));
    res.json({ ok: true });
  });

  return router;
}
