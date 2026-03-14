import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8131;
const ORACLE_URL = process.env.ORACLE_URL ?? 'http://gsr-oracle:8130';

app.use(express.json());

// Tokenized reserves: tokenId -> metadata
const tokens = new Map();

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsr-tokenizer', tokenCount: tokens.size }));

app.get('/tokens', (req, res) => {
  const asset = req.query.asset?.toUpperCase();
  let list = Array.from(tokens.values());
  if (asset) list = list.filter(t => t.asset === asset);
  res.json({ tokens: list, count: list.length });
});

app.get('/tokens/:id', (req, res) => {
  const t = tokens.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'token not found' });
  res.json(t);
});

app.post('/tokenize', async (req, res) => {
  const { reserveId, asset, quantity, issuer, metadata } = req.body;
  if (!reserveId || !asset || !quantity) {
    return res.status(400).json({ error: 'reserveId, asset, quantity required' });
  }

  // Get current valuation from oracle
  let valuationUSD = 0;
  try {
    const r = await fetch(`${ORACLE_URL}/valuate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset, quantity })
    });
    const v = await r.json();
    valuationUSD = v.valuationUSD;
  } catch (e) {
    console.warn('Oracle unavailable, skipping valuation:', e.message);
  }

  const tokenId = 'SRT-' + asset.toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const token = {
    tokenId, reserveId, asset: asset.toUpperCase(), symbol: `SRT-${asset.toUpperCase()}`,
    quantity: Number(quantity), issuer: issuer ?? 'unknown',
    valuationUSD, tokenizedAt: Date.now(), status: 'ACTIVE',
    contractAddress: '0x' + crypto.randomBytes(20).toString('hex'),
    metadata: metadata ?? {},
  };

  tokens.set(tokenId, token);
  console.log(`Tokenized: ${tokenId} — ${quantity} ${asset} (≈$${valuationUSD.toLocaleString()} USD)`);
  res.status(201).json(token);
});

app.post('/tokens/:id/redeem', (req, res) => {
  const t = tokens.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (t.status !== 'ACTIVE') return res.status(400).json({ error: 'token not active' });
  const { amount, redeemer } = req.body;
  const redeemAmt = Math.min(Number(amount ?? t.quantity), t.quantity);
  t.quantity -= redeemAmt;
  if (t.quantity === 0) t.status = 'REDEEMED';
  res.json({ redeemed: true, tokenId: t.tokenId, amount: redeemAmt, remaining: t.quantity });
});

app.listen(PORT, () => console.log(`GSR Tokenizer on :${PORT}`));
