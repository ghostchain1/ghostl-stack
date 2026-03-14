import { Router } from 'express';
import type { ThemeMode } from '@ghostl/types';
import type {
  FeatureFlagsService,
  NetworkContextService,
  ThemeService
} from './services';

export interface AppShellDependencies {
  featureFlags: FeatureFlagsService;
  networkContext: NetworkContextService;
  theme: ThemeService;
}

export const buildAppShellRouter = (deps: AppShellDependencies) => {
  const router = Router();

  router.get('/feature-flags', async (_req, res) => {
    const flags = await deps.featureFlags.list();
    res.json(flags);
  });

  router.post('/feature-flags/:key', async (req, res) => {
    const { key } = req.params;
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled boolean required' });
      return;
    }
    const updated = await deps.featureFlags.setFlag(key, enabled);
    res.json(updated);
  });

  router.get('/network', async (_req, res) => {
    const ctx = await deps.networkContext.getCurrent();
    res.json(ctx);
  });

  router.get('/network/available', async (_req, res) => {
    const networks = await deps.networkContext.listAvailable();
    res.json(networks);
  });

  router.post('/network', async (req, res) => {
    const ctx = await deps.networkContext.setCurrent(req.body);
    res.json(ctx);
  });

  router.get('/theme', async (_req, res) => {
    const mode = await deps.theme.get();
    res.json({ mode });
  });

  router.post('/theme', async (req, res) => {
    const { mode } = req.body as { mode?: string };
    if (!mode) {
      res.status(400).json({ error: 'mode required' });
      return;
    }
    await deps.theme.set(mode as ThemeMode);
    res.json({ mode });
  });

  return router;
};
