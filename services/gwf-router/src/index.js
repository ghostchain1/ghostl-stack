import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8141;

app.use(express.json());

const INSTITUTION_CLASSES = ['GOVERNMENT', 'CENTRAL_BANK', 'SOVEREIGN_FUND', 'MULTILATERAL', 'IMF_WORLD_BANK', 'COMMERCIAL_BANK'];

// GWF registered institutions (GNS name → endpoint mapping)
const institutions = new Map([
  ['gov.us.treasury',        { name: 'US Treasury', class: 'GOVERNMENT',    endpoint: 'http://us-treasury:8100', region: 'US' }],
  ['bank.fed',               { name: 'Federal Reserve', class: 'CENTRAL_BANK', endpoint: 'http://fed:8120', region: 'US' }],
  ['bank.ecb',               { name: 'European Central Bank', class: 'CENTRAL_BANK', endpoint: 'http://ecb:8120', region: 'EU' }],
  ['bank.boj',               { name: 'Bank of Japan', class: 'CENTRAL_BANK', endpoint: 'http://boj:8120', region: 'JP' }],
  ['org.imf',                { name: 'International Monetary Fund', class: 'IMF_WORLD_BANK', endpoint: 'http://imf:8100', region: 'GLOBAL' }],
  ['org.worldbank',          { name: 'World Bank', class: 'IMF_WORLD_BANK', endpoint: 'http://wb:8100', region: 'GLOBAL' }],
]);

const messages = [];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gwf-router', institutions: institutions.size }));

app.get('/institutions', (req, res) => {
  const cls = req.query.class?.toUpperCase();
  let list = Array.from(institutions.entries()).map(([gns, v]) => ({ gns, ...v }));
  if (cls) list = list.filter(i => i.class === cls);
  res.json({ institutions: list });
});

app.post('/institutions', (req, res) => {
  const { gns, name, institutionClass, endpoint, region } = req.body;
  if (!gns || !name || !institutionClass) return res.status(400).json({ error: 'gns, name, institutionClass required' });
  institutions.set(gns, { name, class: institutionClass.toUpperCase(), endpoint: endpoint ?? '', region: region ?? 'GLOBAL' });
  res.status(201).json({ registered: true, gns });
});

app.post('/route', async (req, res) => {
  const { from, to, messageType, payload } = req.body;
  if (!from || !to || !messageType) return res.status(400).json({ error: 'from, to, messageType required' });

  const target = institutions.get(to);
  const msgId  = 'msg-' + crypto.randomUUID();
  const msg = { msgId, from, to, messageType, payload, routedAt: Date.now(), status: 'PENDING' };
  messages.push(msg);

  if (!target) {
    msg.status = 'UNROUTABLE';
    return res.status(404).json({ error: `unknown institution: ${to}`, msgId });
  }

  try {
    const r = await fetch(`${target.endpoint}/gwf/receive`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg), signal: AbortSignal.timeout(10000)
    });
    msg.status = 'DELIVERED';
    res.json({ msgId, status: 'DELIVERED', to, endpoint: target.endpoint });
  } catch (e) {
    msg.status = 'FAILED';
    msg.error  = e.message;
    res.status(502).json({ msgId, status: 'FAILED', error: e.message });
  }
});

app.get('/messages', (req, res) => {
  const status = req.query.status;
  let list = messages;
  if (status) list = list.filter(m => m.status === status);
  res.json({ messages: list.slice(-100), count: messages.length });
});

app.listen(PORT, () => console.log(`GWF Router on :${PORT}`));
