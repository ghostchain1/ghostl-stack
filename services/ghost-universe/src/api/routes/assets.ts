import { Router } from 'express';
import { AssetMarketplace } from '../../marketplace/AssetMarketplace.js';
import { UniverseEconomy }  from '../../economy/UniverseEconomy.js';

export function assetsRouter(market: AssetMarketplace, economy: UniverseEconomy): Router {
  const router = Router();

  /** POST /assets — list an asset for sale */
  router.post('/', (req, res) => {
    const { creator, name, description, assetUri, category, priceGST, royaltyBps } = req.body as {
      creator?: string; name?: string; description?: string; assetUri?: string;
      category?: string; priceGST?: string; royaltyBps?: string;
    };
    if (!creator || !name || !assetUri || !category || !priceGST) {
      res.status(400).json({ error: 'creator, name, assetUri, category, priceGST required' });
      return;
    }
    const assetId = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const asset = market.listAsset({
      assetId,
      name,
      description: description ?? '',
      assetUri,
      previewUri: assetUri,
      category:   category as never,
      creatorAddress: creator,
      sellerAddress:  creator,
      priceGST:   BigInt(priceGST),
      royaltyBps: royaltyBps ? BigInt(royaltyBps) : 500n,
    });
    res.status(201).json({ asset });
  });

  /** GET /assets — search */
  router.get('/', (req, res) => {
    const { category, keyword, maxPrice } = req.query as {
      category?: string; keyword?: string; maxPrice?: string;
    };
    const assets = market.search({
      category:    category as never,
      keyword,
      maxPriceGST: maxPrice ? BigInt(maxPrice) : undefined,
    });
    res.json({ assets });
  });

  /** GET /assets/:id */
  router.get('/:id', (req, res) => {
    const asset = market.getAsset(req.params.id);
    if (!asset) { res.status(404).json({ error: 'Asset not found' }); return; }
    res.json({ asset });
  });

  /** POST /assets/:id/buy */
  router.post('/:id/buy', async (req, res) => {
    const { buyer } = req.body as { buyer?: string };
    if (!buyer) { res.status(400).json({ error: 'buyer required' }); return; }

    const asset = market.getAsset(req.params.id);
    if (!asset) { res.status(404).json({ error: 'Asset not found' }); return; }
    if (!asset.available) { res.status(409).json({ error: 'Asset already sold' }); return; }

    const txs     = await economy.purchaseAsset(buyer, asset.creatorAddress, asset.priceGST, asset.royaltyBps, asset.assetId);
    const receipt = market.purchaseAsset(asset.assetId, buyer);
    res.json({ receipt, txs });
  });

  /** DELETE /assets/:id */
  router.delete('/:id', (req, res) => {
    market.delistAsset(req.params.id);
    res.json({ ok: true });
  });

  /** GET /assets/stats */
  router.get('/stats', (_req, res) => {
    const stats = market.getStats();
    res.json({ stats: {
      ...stats,
      totalVolumeGST: stats.totalVolumeGST.toString(),
      totalFeesGST:   stats.totalFeesGST.toString(),
    }});
  });

  return router;
}
