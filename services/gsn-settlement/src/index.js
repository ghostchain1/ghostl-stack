import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8111;

app.use(express.json());

const settlements = new Map();
// FX rates (simplified — production: feeds from GSR oracle)
const fxRates = new Map([
  ['USD/EUR', 0.92], ['USD/JPY', 149.5], ['USD/GBP', 0.79],
  ['USD/CNY', 7.24], ['EUR/USD', 1.087], ['GBP/USD', 1.267],
  ['JPY/USD', 0.0067], ['CNY/USD', 0.138],
]);

const convert = (from, to, amount) => {
  if (from === to) return amount;
  const key = `${from}/${to}`;
  const rate = fxRates.get(key);
  if (rate) return amount * rate;
  // Try inverse
  const invKey = `${to}/${from}`;
  const inv = fxRates.get(invKey);
  if (inv) return amount / inv;
  return amount; // fallback: 1:1
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsn-settlement' }));

app.post('/settle', async (req, res) => {
  const { id, from, to, currency, amount, purpose } = req.body;
  const settlementId = id ?? crypto.randomUUID();

  // Determine settlement currency (default USD)
  const targetCurrency = req.body.targetCurrency ?? 'USD';
  const convertedAmount = convert(currency, targetCurrency, Number(amount));

  const s = {
    settlementId, from, to, currency, amount: Number(amount),
    targetCurrency, convertedAmount,
    purpose: purpose ?? 'cross-border-settlement',
    status: 'COMPLETED',
    txHash: '0x' + crypto.randomBytes(32).toString('hex'),
    settledAt: Date.now(),
    fxRate: convertedAmount / Number(amount),
  };

  settlements.set(settlementId, s);
  console.log(`Settlement ${settlementId}: ${amount} ${currency} (=${convertedAmount} ${targetCurrency}) ${from} → ${to}`);
  res.json(s);
});

app.get('/settlements', (req, res) => {
  const list = Array.from(settlements.values());
  const total = list.reduce((s, x) => s + x.convertedAmount, 0);
  res.json({ settlements: list.slice(-100), count: list.length, totalValue: total });
});

app.get('/fx-rates', (req, res) => {
  res.json({ rates: Object.fromEntries(fxRates) });
});

app.post('/fx-rates', (req, res) => {
  const { pair, rate } = req.body;
  if (!pair || !rate) return res.status(400).json({ error: 'pair and rate required' });
  fxRates.set(pair, Number(rate));
  res.json({ updated: true, pair, rate: Number(rate) });
});

app.listen(PORT, () => console.log(`GSN Settlement service on :${PORT}`));
