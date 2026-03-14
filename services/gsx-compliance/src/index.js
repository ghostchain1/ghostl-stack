import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8102;

app.use(express.json());

// In-memory compliance registry (production: backed by PostgreSQL + chain reads)
const registry = new Map();

const Status = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', SANCTIONED: 'SANCTIONED' };

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsx-compliance' }));

app.get('/check/:address', (req, res) => {
  const addr   = req.params.address.toLowerCase();
  const record = registry.get(addr);
  if (!record) return res.json({ approved: false, reason: 'not registered', address: addr });

  const expired = record.kycExpiry && Date.now() > record.kycExpiry;
  if (expired) return res.json({ approved: false, reason: 'KYC expired', address: addr, record });
  if (record.status !== Status.APPROVED) return res.json({ approved: false, reason: record.status, address: addr, record });

  res.json({ approved: true, address: addr, record });
});

app.post('/register', (req, res) => {
  const { address, name, jurisdiction, institutionType } = req.body;
  if (!address || !name) return res.status(400).json({ error: 'address and name required' });
  const addr = address.toLowerCase();
  registry.set(addr, {
    address: addr, name, jurisdiction, institutionType,
    status: Status.PENDING, kycExpiry: null, riskScore: 100,
    amlCleared: false, registeredAt: Date.now()
  });
  res.json({ registered: true, address: addr });
});

app.post('/approve', (req, res) => {
  const { address, kycDays = 365, riskScore = 25 } = req.body;
  const addr = address?.toLowerCase();
  const rec  = registry.get(addr);
  if (!rec) return res.status(404).json({ error: 'not registered' });
  rec.status     = Status.APPROVED;
  rec.kycExpiry  = Date.now() + kycDays * 86400 * 1000;
  rec.riskScore  = riskScore;
  rec.amlCleared = true;
  res.json({ approved: true, address: addr, kycExpiry: rec.kycExpiry });
});

app.post('/reject', (req, res) => {
  const addr = req.body.address?.toLowerCase();
  const rec  = registry.get(addr);
  if (!rec) return res.status(404).json({ error: 'not registered' });
  rec.status = Status.REJECTED;
  rec.reason = req.body.reason ?? 'Manual rejection';
  res.json({ rejected: true, address: addr });
});

app.post('/sanction', (req, res) => {
  const addr = req.body.address?.toLowerCase();
  const rec  = registry.get(addr);
  if (!rec) return res.status(404).json({ error: 'not registered' });
  rec.status = Status.SANCTIONED;
  rec.sanctionedAt = Date.now();
  res.json({ sanctioned: true, address: addr });
});

app.post('/lift-sanction', (req, res) => {
  const addr = req.body.address?.toLowerCase();
  const rec  = registry.get(addr);
  if (!rec) return res.status(404).json({ error: 'not registered' });
  rec.status = Status.PENDING;
  delete rec.sanctionedAt;
  res.json({ lifted: true, address: addr });
});

app.get('/institutions', (req, res) => {
  res.json({ institutions: Array.from(registry.values()) });
});

app.listen(PORT, () => console.log(`GSX Compliance service on :${PORT}`));
