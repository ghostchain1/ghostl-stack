import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8130;

app.use(express.json());

// Sovereign strategic commodity prices (USD / unit)
// Production: fed from validated multi-source price reporters
const prices = new Map([
  ['GOLD',     { asset: 'GOLD',     price: 2034.50, unit: 'troy_oz',   updatedAt: Date.now() }],
  ['OIL',      { asset: 'OIL',      price: 77.20,   unit: 'barrel',    updatedAt: Date.now() }],
  ['GAS',      { asset: 'GAS',      price: 2.18,    unit: 'mmbtu',     updatedAt: Date.now() }],
  ['WHEAT',    { asset: 'WHEAT',    price: 5.40,    unit: 'bushel',    updatedAt: Date.now() }],
  ['LITHIUM',  { asset: 'LITHIUM',  price: 14000.0, unit: 'tonne',     updatedAt: Date.now() }],
  ['COPPER',   { asset: 'COPPER',   price: 3.85,    unit: 'lb',        updatedAt: Date.now() }],
  ['SILVER',   { asset: 'SILVER',   price: 23.45,   unit: 'troy_oz',   updatedAt: Date.now() }],
  ['PALLADIUM',{ asset: 'PALLADIUM',price: 915.0,   unit: 'troy_oz',   updatedAt: Date.now() }],
  ['URANIUM',  { asset: 'URANIUM',  price: 92.50,   unit: 'lb',        updatedAt: Date.now() }],
  ['CARBON',   { asset: 'CARBON',   price: 65.0,    unit: 'tonne_co2', updatedAt: Date.now() }],
]);

const priceReporters = new Set();
const priceHistory = new Map(); // asset -> []

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsr-oracle', assets: prices.size }));

app.get('/prices', (req, res) => {
  res.json({ prices: Array.from(prices.values()) });
});

app.get('/prices/:asset', (req, res) => {
  const p = prices.get(req.params.asset.toUpperCase());
  if (!p) return res.status(404).json({ error: 'unknown asset' });
  res.json(p);
});

app.post('/report', (req, res) => {
  const { asset, price, reporter, source } = req.body;
  if (!asset || price === undefined) return res.status(400).json({ error: 'asset and price required' });
  const key = asset.toUpperCase();
  const prev = prices.get(key)?.price ?? 0;
  const entry = { asset: key, price: Number(price), unit: prices.get(key)?.unit ?? 'unit', updatedAt: Date.now(), reporter, source };
  prices.set(key, entry);
  priceReporters.add(reporter);
  if (!priceHistory.has(key)) priceHistory.set(key, []);
  const hist = priceHistory.get(key);
  hist.push({ price: Number(price), prevPrice: prev, ts: Date.now(), reporter, source });
  if (hist.length > 1000) hist.shift();
  console.log(`Price update: ${key} ${prev} → ${price} by ${reporter}`);
  res.json({ updated: true, asset: key, prev, price: Number(price) });
});

app.get('/history/:asset', (req, res) => {
  const hist = priceHistory.get(req.params.asset.toUpperCase()) ?? [];
  const n = Math.min(parseInt(req.query.limit ?? '100'), 1000);
  res.json({ asset: req.params.asset.toUpperCase(), history: hist.slice(-n) });
});

// Compute valuation of a reserve given asset, quantity
app.post('/valuate', (req, res) => {
  const { asset, quantity } = req.body;
  const p = prices.get(asset?.toUpperCase());
  if (!p) return res.status(404).json({ error: 'unknown asset' });
  const valuationUSD = p.price * Number(quantity);
  res.json({ asset: p.asset, quantity: Number(quantity), pricePerUnit: p.price, unit: p.unit, valuationUSD });
});

app.listen(PORT, () => console.log(`GSR Oracle on :${PORT}`));
