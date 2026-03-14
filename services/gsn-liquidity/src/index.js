import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8112;

app.use(express.json());

// Liquidity pools per currency
const pools = new Map([
  ['USD', { currency: 'USD', balance: 10_000_000_000, reserved: 0, utilization: 0 }],
  ['EUR', { currency: 'EUR', balance: 8_000_000_000,  reserved: 0, utilization: 0 }],
  ['JPY', { currency: 'JPY', balance: 1_200_000_000_000, reserved: 0, utilization: 0 }],
  ['GBP', { currency: 'GBP', balance: 5_000_000_000,  reserved: 0, utilization: 0 }],
  ['CNY', { currency: 'CNY', balance: 50_000_000_000, reserved: 0, utilization: 0 }],
]);

const updateUtilization = (pool) => {
  pool.utilization = pool.balance > 0 ? (pool.reserved / pool.balance) * 100 : 100;
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsn-liquidity' }));

app.get('/pools', (req, res) => {
  res.json({ pools: Array.from(pools.values()) });
});

app.get('/pools/:currency', (req, res) => {
  const p = pools.get(req.params.currency.toUpperCase());
  if (!p) return res.status(404).json({ error: 'pool not found' });
  res.json(p);
});

app.post('/inject', (req, res) => {
  const { currency, amount, provider } = req.body;
  if (!currency || !amount) return res.status(400).json({ error: 'currency and amount required' });
  const curr = currency.toUpperCase();
  if (!pools.has(curr)) pools.set(curr, { currency: curr, balance: 0, reserved: 0, utilization: 0 });
  const p = pools.get(curr);
  p.balance += Number(amount);
  updateUtilization(p);
  console.log(`Liquidity inject: ${amount} ${curr} by ${provider}`);
  res.json({ injected: true, currency: curr, newBalance: p.balance });
});

app.post('/reserve', (req, res) => {
  const { currency, amount, settlementId } = req.body;
  const curr = currency?.toUpperCase();
  const p = pools.get(curr);
  if (!p) return res.status(404).json({ error: 'pool not found' });
  const amt = Number(amount);
  const available = p.balance - p.reserved;
  if (available < amt) return res.status(400).json({ error: 'insufficient liquidity', available });
  p.reserved += amt;
  updateUtilization(p);
  res.json({ reserved: true, currency: curr, amount: amt, utilization: p.utilization });
});

app.post('/release', (req, res) => {
  const { currency, amount } = req.body;
  const curr = currency?.toUpperCase();
  const p = pools.get(curr);
  if (!p) return res.status(404).json({ error: 'pool not found' });
  p.reserved = Math.max(0, p.reserved - Number(amount));
  updateUtilization(p);
  res.json({ released: true, currency: curr });
});

app.listen(PORT, () => console.log(`GSN Liquidity service on :${PORT}`));
