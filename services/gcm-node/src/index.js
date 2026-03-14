import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8120;

app.use(express.json());

const NODE_ID     = process.env.NODE_ID     ?? 'GCM-NODE-DEFAULT';
const CENTRAL_BANK = process.env.CENTRAL_BANK ?? 'Unknown Central Bank';
const JURISDICTION = process.env.JURISDICTION ?? 'GLOBAL';

// Connected central banks registry
const registry = new Map([
  ['FED', { name: 'Federal Reserve', jurisdiction: 'US', status: 'CONNECTED', endpoint: 'http://fed-node:8120' }],
  ['ECB', { name: 'European Central Bank', jurisdiction: 'EU', status: 'CONNECTED', endpoint: 'http://ecb-node:8120' }],
  ['BOJ', { name: 'Bank of Japan', jurisdiction: 'JP', status: 'CONNECTED', endpoint: 'http://boj-node:8120' }],
  ['BOE', { name: 'Bank of England', jurisdiction: 'GB', status: 'CONNECTED', endpoint: 'http://boe-node:8120' }],
  ['PBOC', { name: "People's Bank of China", jurisdiction: 'CN', status: 'CONNECTED', endpoint: 'http://pboc-node:8120' }],
]);

const metrics = { messagesReceived: 0, messagesSent: 0, policySyncs: 0 };

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gcm-node', nodeId: NODE_ID, centralBank: CENTRAL_BANK, jurisdiction: JURISDICTION });
});

app.get('/node-info', (req, res) => {
  res.json({ nodeId: NODE_ID, centralBank: CENTRAL_BANK, jurisdiction: JURISDICTION, metrics });
});

app.get('/network', (req, res) => {
  res.json({ nodes: Array.from(registry.values()), count: registry.size });
});

app.post('/register', (req, res) => {
  const { code, name, jurisdiction, endpoint } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'code and name required' });
  registry.set(code.toUpperCase(), { name, jurisdiction, status: 'CONNECTED', endpoint });
  res.json({ registered: true, code: code.toUpperCase() });
});

app.post('/broadcast', async (req, res) => {
  const { type, payload } = req.body;
  const results = [];
  metrics.messagesSent += registry.size;
  for (const [code, node] of registry) {
    try {
      const r = await fetch(`${node.endpoint}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: NODE_ID, type, payload }), signal: AbortSignal.timeout(5000)
      });
      results.push({ code, status: 'sent', response: await r.json() });
    } catch (e) {
      results.push({ code, status: 'failed', error: e.message });
    }
  }
  res.json({ broadcast: true, type, results });
});

app.post('/receive', (req, res) => {
  metrics.messagesReceived++;
  const { from, type, payload } = req.body;
  console.log(`GCM message from ${from}: ${type}`);
  if (type === 'POLICY_SYNC') metrics.policySyncs++;
  res.json({ received: true, nodeId: NODE_ID, type, from });
});

app.listen(PORT, () => console.log(`GCM Node ${NODE_ID} (${CENTRAL_BANK}) on :${PORT}`));
