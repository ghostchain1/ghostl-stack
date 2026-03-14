import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8105;

app.use(express.json());

// CBDC currencies: symbol -> state
const currencies = new Map([
  ['USD-CBDC', { name: 'United States Dollar CBDC', symbol: 'USD-CBDC', supply: 0n, policy: { txLimit: 0, holdingLimit: 0, rateBps: 0, frozen: false } }],
  ['EUR-CBDC', { name: 'Euro CBDC', symbol: 'EUR-CBDC', supply: 0n, policy: { txLimit: 0, holdingLimit: 0, rateBps: 0, frozen: false } }],
  ['JPY-CBDC', { name: 'Japanese Yen CBDC', symbol: 'JPY-CBDC', supply: 0n, policy: { txLimit: 0, holdingLimit: 0, rateBps: 0, frozen: false } }],
  ['GBP-CBDC', { name: 'British Pound CBDC', symbol: 'GBP-CBDC', supply: 0n, policy: { txLimit: 0, holdingLimit: 0, rateBps: 0, frozen: false } }],
  ['CNY-CBDC', { name: 'Chinese Yuan CBDC', symbol: 'CNY-CBDC', supply: 0n, policy: { txLimit: 0, holdingLimit: 0, rateBps: 0, frozen: false } }],
]);

// Account balances: symbol -> (address -> balance)
const accounts = new Map();

const getAccount = (symbol, address) => {
  if (!accounts.has(symbol)) accounts.set(symbol, new Map());
  return accounts.get(symbol);
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsx-cbdc' }));

app.get('/currencies', (req, res) => {
  const list = Array.from(currencies.values()).map(c => ({
    ...c, supply: String(c.supply)
  }));
  res.json({ currencies: list });
});

app.get('/currency/:symbol', (req, res) => {
  const c = currencies.get(req.params.symbol);
  if (!c) return res.status(404).json({ error: 'unknown currency' });
  res.json({ ...c, supply: String(c.supply) });
});

app.post('/mint', (req, res) => {
  const { symbol, recipient, amount, centralBank } = req.body;
  if (!symbol || !recipient || !amount) return res.status(400).json({ error: 'symbol, recipient, amount required' });
  const c = currencies.get(symbol);
  if (!c) return res.status(404).json({ error: 'unknown currency' });
  if (c.policy.frozen) return res.status(403).json({ error: 'currency globally frozen' });
  const accts = getAccount(symbol, recipient);
  const prev  = accts.get(recipient) ?? 0n;
  const amt   = BigInt(amount);
  accts.set(recipient, prev + amt);
  c.supply += amt;
  const txHash = '0xmint' + Math.random().toString(16).slice(2).padStart(60, '0');
  console.log(`CBDC MINT: ${amount} ${symbol} → ${recipient} by ${centralBank}`);
  res.json({ minted: true, symbol, recipient, amount: String(amt), newBalance: String(prev + amt), txHash });
});

app.post('/burn', (req, res) => {
  const { symbol, from, amount } = req.body;
  if (!symbol || !from || !amount) return res.status(400).json({ error: 'symbol, from, amount required' });
  const c    = currencies.get(symbol);
  if (!c) return res.status(404).json({ error: 'unknown currency' });
  const accts = getAccount(symbol, from);
  const bal   = accts.get(from) ?? 0n;
  const amt   = BigInt(amount);
  if (bal < amt) return res.status(400).json({ error: 'insufficient balance' });
  accts.set(from, bal - amt);
  c.supply -= amt;
  console.log(`CBDC BURN: ${amount} ${symbol} from ${from}`);
  res.json({ burned: true, symbol, from, amount: String(amt) });
});

app.post('/policy', (req, res) => {
  const { symbol, txLimit, holdingLimit, rateBps, frozen } = req.body;
  const c = currencies.get(symbol);
  if (!c) return res.status(404).json({ error: 'unknown currency' });
  if (txLimit     !== undefined) c.policy.txLimit      = Number(txLimit);
  if (holdingLimit !== undefined) c.policy.holdingLimit = Number(holdingLimit);
  if (rateBps     !== undefined) c.policy.rateBps      = Number(rateBps);
  if (frozen      !== undefined) c.policy.frozen        = Boolean(frozen);
  res.json({ updated: true, symbol, policy: c.policy });
});

app.get('/balance/:symbol/:address', (req, res) => {
  const { symbol, address } = req.params;
  const accts = accounts.get(symbol);
  const bal   = accts?.get(address) ?? 0n;
  res.json({ symbol, address, balance: String(bal) });
});

app.listen(PORT, () => console.log(`GSX CBDC service on :${PORT}`));
