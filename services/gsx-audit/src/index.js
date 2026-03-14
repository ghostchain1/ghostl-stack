import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8106;

app.use(express.json());

const logs = [];
const MAX_LOGS = 100_000;

const EVENT_TYPES = [
  'ORDER_SUBMITTED', 'ORDER_FILLED', 'ORDER_CANCELLED', 'ORDER_REJECTED',
  'TRADE_EXECUTED', 'SETTLEMENT_SUBMITTED', 'SETTLEMENT_CONFIRMED',
  'CBDC_MINTED', 'CBDC_BURNED', 'RESERVE_PROPOSED', 'RESERVE_ACTIVATED',
  'COMPLIANCE_APPROVED', 'COMPLIANCE_REJECTED', 'SANCTION_APPLIED',
  'CUSTODY_REQUESTED', 'CUSTODY_APPROVED', 'CUSTODY_EXECUTED',
  'POLICY_UPDATED', 'BOND_ISSUED', 'BOND_PURCHASED', 'BOND_REDEEMED',
];

const hashChain = (prevHash, entry) => {
  const h = crypto.createHash('sha256');
  h.update(prevHash + JSON.stringify(entry));
  return h.digest('hex');
};

let chainHead = '0'.repeat(64);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsx-audit', logCount: logs.length }));

app.post('/log', (req, res) => {
  const { event, institution, ...data } = req.body;
  if (!event) return res.status(400).json({ error: 'event required' });

  const entry = {
    id:          crypto.randomUUID(),
    seq:         logs.length,
    event,
    institution: institution ?? 'unknown',
    data,
    timestamp:   Date.now(),
    isoTime:     new Date().toISOString(),
    prevHash:    chainHead,
    hash:        null,
  };

  chainHead = hashChain(chainHead, entry);
  entry.hash = chainHead;

  if (logs.length >= MAX_LOGS) logs.shift(); // rolling window
  logs.push(entry);

  res.status(201).json({ logged: true, id: entry.id, seq: entry.seq, hash: entry.hash });
});

app.get('/logs', (req, res) => {
  const { event, institution, from, to, limit = '100' } = req.query;
  let result = logs;
  if (event)       result = result.filter(l => l.event === event);
  if (institution) result = result.filter(l => l.institution === institution);
  if (from)        result = result.filter(l => l.timestamp >= Number(from));
  if (to)          result = result.filter(l => l.timestamp <= Number(to));
  const n = Math.min(parseInt(limit), 1000);
  result = result.slice(-n);
  res.json({ logs: result, count: result.length, total: logs.length });
});

app.get('/logs/events', (req, res) => res.json({ eventTypes: EVENT_TYPES }));

app.get('/logs/chain-head', (req, res) => {
  res.json({ chainHead, logCount: logs.length });
});

app.get('/logs/verify', (req, res) => {
  // Verify integrity of the stored log chain
  let valid = true;
  let prev  = '0'.repeat(64);
  for (const entry of logs) {
    if (entry.prevHash !== prev) { valid = false; break; }
    const computed = hashChain(prev, { ...entry, hash: null });
    if (computed !== entry.hash) { valid = false; break; }
    prev = entry.hash;
  }
  res.json({ valid, logCount: logs.length, chainHead });
});

app.listen(PORT, () => console.log(`GSX Audit service on :${PORT}`));
