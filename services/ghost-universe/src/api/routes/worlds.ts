import { Router } from 'express';
import { WorldEngine } from '../../world/WorldEngine.js';

export function worldsRouter(worlds: WorldEngine): Router {
  const router = Router();

  /** GET /worlds — list all worlds */
  router.get('/', (_req, res) => {
    res.json({ worlds: worlds.listWorlds().map(w => ({
      worldId:   w.id,
      name:      w.name,
      theme:     w.theme,
      players:   w.playerCount,
      maxPlayers:w.maxPlayers,
      createdAt: w.createdAt,
    })) });
  });

  /** POST /worlds — create a world */
  router.post('/', async (req, res) => {
    const { name, theme, seed, maxPlayers } = req.body as {
      name?: string; theme?: string; seed?: number; maxPlayers?: number;
    };
    if (!name) { res.status(400).json({ error: 'name required' }); return; }

    const world = await worlds.createWorld({ name, theme: theme as never, seed, maxPlayers });
    res.status(201).json({ world });
  });

  /** GET /worlds/:id */
  router.get('/:id', (req, res) => {
    const world = worlds.getWorld(req.params.id);
    if (!world) { res.status(404).json({ error: 'World not found' }); return; }
    res.json({ world });
  });

  /** GET /worlds/:id/environment */
  router.get('/:id/environment', (req, res) => {
    const env = worlds.getEnvironment(req.params.id);
    if (!env) { res.status(404).json({ error: 'World not found' }); return; }
    res.json({ environment: env });
  });

  /** GET /worlds/:id/map */
  router.get('/:id/map', (req, res) => {
    const map = worlds.getMap(req.params.id);
    if (!map) { res.status(404).json({ error: 'World not found' }); return; }
    res.json({ map: map.toGeoJSON() });
  });

  /** DELETE /worlds/:id */
  router.delete('/:id', (req, res) => {
    worlds.destroyWorld(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
