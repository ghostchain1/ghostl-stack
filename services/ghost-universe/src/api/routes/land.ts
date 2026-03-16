import { Router } from 'express';
import { LandSystem } from '../../land/LandSystem.js';
import { UniverseEconomy } from '../../economy/UniverseEconomy.js';

export function landRouter(land: LandSystem, economy: UniverseEconomy): Router {
  const router = Router();

  /** POST /land/mint */
  router.post('/mint', (req, res) => {
    const { owner, x, y, type, worldId } = req.body as {
      owner?: string; x?: number; y?: number; type?: string; worldId?: string;
    };
    if (!owner || x === undefined || y === undefined || !worldId) {
      res.status(400).json({ error: 'owner, x, y, worldId required' });
      return;
    }
    const parcel = land.mintLand(owner, x, y, type as never ?? 'residential', worldId);
    res.status(201).json({ parcel });
  });

  /** GET /land/market */
  router.get('/market', (req, res) => {
    const worldId = req.query.worldId as string | undefined;
    res.json({ parcels: land.getMarket(worldId) });
  });

  /** POST /land/list */
  router.post('/list', (req, res) => {
    const { x, y, priceGST, seller } = req.body as {
      x?: number; y?: number; priceGST?: string; seller?: string;
    };
    if (x === undefined || y === undefined || !priceGST || !seller) {
      res.status(400).json({ error: 'x, y, priceGST, seller required' });
      return;
    }
    land.listForSale(x, y, BigInt(priceGST), seller);
    res.json({ ok: true });
  });

  /** POST /land/buy */
  router.post('/buy', async (req, res) => {
    const { x, y, buyer } = req.body as { x?: number; y?: number; buyer?: string };
    if (x === undefined || y === undefined || !buyer) {
      res.status(400).json({ error: 'x, y, buyer required' });
      return;
    }
    const parcel = land.getParcel(x, y);
    if (!parcel) { res.status(404).json({ error: 'Parcel not found' }); return; }
    if (parcel.priceGST === null) {
      res.status(409).json({ error: 'Parcel not for sale' });
      return;
    }

    const txs = await economy.buyLand(buyer, parcel.owner, parcel.priceGST!, `${x}:${y}`);
    land.buyLand(x, y, buyer);
    res.json({ ok: true, parcel: land.getParcel(x, y), txs });
  });

  /** GET /land/stats */
  router.get('/stats', (req, res) => {
    const worldId = req.query.worldId as string | undefined;
    const stats = land.getStats(worldId);
    res.json({ stats: { ...stats, avgPriceGST: stats.avgPriceGST.toString() } });
  });

  return router;
}
