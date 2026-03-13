import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8104;
const REQUIRED_APPROVALS = 3;

app.use(express.json());

const reserves  = new Map();
const approvals = new Map(); // reserveId -> Set<validator>
let   seq       = 0;

const RESERVE_TYPES = ['GOLD', 'OIL', 'GAS', 'WHEAT', 'LITHIUM', 'FOREX', 'BONDS', 'ENERGY', 'CARBON', 'INFRA'];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsx-reserve' }));

app.get('/reserve-types', (req, res) => res.json({ types: RESERVE_TYPES }));

app.get('/reserves', (req, res) => {
  const type = req.query.type;
  let list = Array.from(reserves.values());
  if (type) list = list.filter(r => r.reserveType === type.toUpperCase());
  res.json({ reserves: list, count: list.length });
});

app.get('/reserves/:id', (req, res) => {
  const r = reserves.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});

app.post('/reserves', (req, res) => {
  const { name, reserveType, supply, issuer, unit, location } = req.body;
  if (!name || !reserveType || !supply) return res.status(400).json({ error: 'name, reserveType, supply required' });
  if (!RESERVE_TYPES.includes(reserveType.toUpperCase())) {
    return res.status(400).json({ error: `invalid reserveType, must be one of: ${RESERVE_TYPES.join(', ')}` });
  }
  const id = 'res-' + (++seq) + '-' + crypto.randomBytes(4).toString('hex');
  const reserve = {
    id, name, reserveType: reserveType.toUpperCase(), supply: Number(supply),
    issuer: issuer ?? 'unknown', unit: unit ?? 'unit', location: location ?? 'undisclosed',
    active: false, approvalCount: 0, createdAt: Date.now()
  };
  reserves.set(id, reserve);
  approvals.set(id, new Set());
  console.log(`Reserve proposed: ${id} — ${name} (${reserveType})`);
  res.status(201).json({ id, status: 'pending', required: REQUIRED_APPROVALS });
});

app.post('/reserves/:id/approve', (req, res) => {
  const { validator } = req.body;
  const r = reserves.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  if (r.active) return res.status(400).json({ error: 'already active' });
  const vSet = approvals.get(req.params.id);
  if (vSet.has(validator)) return res.status(400).json({ error: 'already voted' });
  vSet.add(validator);
  r.approvalCount = vSet.size;
  if (r.approvalCount >= REQUIRED_APPROVALS) {
    r.active = true;
    r.activatedAt = Date.now();
    console.log(`Reserve ${req.params.id} ACTIVATED`);
  }
  res.json({ id: req.params.id, approvalCount: r.approvalCount, active: r.active });
});

app.post('/reserves/:id/deactivate', (req, res) => {
  const r = reserves.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  r.active = false;
  res.json({ deactivated: true, id: req.params.id });
});

app.listen(PORT, () => console.log(`GSX Reserve service on :${PORT}`));
