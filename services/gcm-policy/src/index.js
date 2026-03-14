import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8121;

app.use(express.json());

// Per-currency monetary policy state
const policies = new Map([
  ['USD', { currency: 'USD', interestRateBps: 550,  reserveRatioBps: 1000, liquidityCap: 1e12, velocityLimit: 1e9,  updatedAt: Date.now() }],
  ['EUR', { currency: 'EUR', interestRateBps: 400,  reserveRatioBps: 1000, liquidityCap: 8e11, velocityLimit: 8e8,  updatedAt: Date.now() }],
  ['JPY', { currency: 'JPY', interestRateBps: 10,   reserveRatioBps: 500,  liquidityCap: 1e14, velocityLimit: 1e11, updatedAt: Date.now() }],
  ['GBP', { currency: 'GBP', interestRateBps: 525,  reserveRatioBps: 1000, liquidityCap: 6e11, velocityLimit: 6e8,  updatedAt: Date.now() }],
  ['CNY', { currency: 'CNY', interestRateBps: 345,  reserveRatioBps: 1200, liquidityCap: 5e12, velocityLimit: 5e9,  updatedAt: Date.now() }],
]);

const policyHistory = [];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gcm-policy' }));

app.get('/policies', (req, res) => {
  res.json({ policies: Array.from(policies.values()) });
});

app.get('/policies/:currency', (req, res) => {
  const p = policies.get(req.params.currency.toUpperCase());
  if (!p) return res.status(404).json({ error: 'unknown currency' });
  res.json(p);
});

app.post('/policies/:currency', (req, res) => {
  const curr = req.params.currency.toUpperCase();
  if (!policies.has(curr)) {
    policies.set(curr, { currency: curr, interestRateBps: 0, reserveRatioBps: 0, liquidityCap: 0, velocityLimit: 0, updatedAt: 0 });
  }
  const p = policies.get(curr);
  const prev = { ...p };
  const { interestRateBps, reserveRatioBps, liquidityCap, velocityLimit } = req.body;
  if (interestRateBps !== undefined) p.interestRateBps = Number(interestRateBps);
  if (reserveRatioBps !== undefined) p.reserveRatioBps = Number(reserveRatioBps);
  if (liquidityCap    !== undefined) p.liquidityCap    = Number(liquidityCap);
  if (velocityLimit   !== undefined) p.velocityLimit   = Number(velocityLimit);
  p.updatedAt = Date.now();
  policyHistory.push({ currency: curr, prev, next: { ...p }, changedAt: p.updatedAt });
  console.log(`Policy updated for ${curr}:`, req.body);
  res.json({ updated: true, policy: p });
});

app.get('/history', (req, res) => {
  const curr = req.query.currency?.toUpperCase();
  let hist = policyHistory;
  if (curr) hist = hist.filter(h => h.currency === curr);
  res.json({ history: hist.slice(-100) });
});

app.post('/emergency-rate', (req, res) => {
  const { currency, newRateBps, reason } = req.body;
  const curr = currency?.toUpperCase();
  const p = policies.get(curr);
  if (!p) return res.status(404).json({ error: 'unknown currency' });
  const prev = p.interestRateBps;
  p.interestRateBps = Number(newRateBps);
  p.updatedAt = Date.now();
  console.warn(`EMERGENCY RATE CHANGE: ${curr} ${prev}bps → ${newRateBps}bps. Reason: ${reason}`);
  res.json({ applied: true, currency: curr, prev, newRateBps: Number(newRateBps), reason });
});

app.listen(PORT, () => console.log(`GCM Policy engine on :${PORT}`));
