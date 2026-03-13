import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8132;

app.use(express.json());

const audits = new Map(); // reserveId -> []

const METHODOLOGIES = ['PHYSICAL_COUNT', 'ASSAY_SAMPLING', 'SATELLITE_IMAGING', 'BLOCKCHAIN_ATTESTATION', 'INDEPENDENT_SURVEYOR'];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsr-audit' }));

app.get('/methodologies', (req, res) => res.json({ methodologies: METHODOLOGIES }));

app.get('/audits', (req, res) => {
  const all = Array.from(audits.values()).flat();
  all.sort((a, b) => b.auditedAt - a.auditedAt);
  res.json({ audits: all.slice(0, 100), total: all.length });
});

app.get('/audits/:reserveId', (req, res) => {
  const list = audits.get(req.params.reserveId) ?? [];
  res.json({ reserveId: req.params.reserveId, audits: list });
});

app.post('/audits', (req, res) => {
  const { reserveId, auditor, methodology, quantityVerified, valuationUSD, evidenceHash, notes } = req.body;
  if (!reserveId || !auditor || !methodology || quantityVerified === undefined) {
    return res.status(400).json({ error: 'reserveId, auditor, methodology, quantityVerified required' });
  }
  if (!METHODOLOGIES.includes(methodology)) {
    return res.status(400).json({ error: `methodology must be one of: ${METHODOLOGIES.join(', ')}` });
  }

  const auditId = 'audit-' + crypto.randomUUID();
  const audit = {
    auditId, reserveId, auditor, methodology,
    quantityVerified: Number(quantityVerified),
    valuationUSD: valuationUSD ? Number(valuationUSD) : null,
    evidenceHash: evidenceHash ?? null,   // IPFS CID or SHA256 hash of evidence documents
    notes: notes ?? null,
    auditedAt: Date.now(),
    attestation: crypto.createHash('sha256').update(auditId + reserveId + auditor + quantityVerified).digest('hex'),
  };

  if (!audits.has(reserveId)) audits.set(reserveId, []);
  audits.get(reserveId).push(audit);

  console.log(`Audit ${auditId}: ${reserveId} by ${auditor} via ${methodology}`);
  res.status(201).json(audit);
});

app.get('/audits/:reserveId/latest', (req, res) => {
  const list = audits.get(req.params.reserveId) ?? [];
  if (!list.length) return res.status(404).json({ error: 'no audits found' });
  res.json(list[list.length - 1]);
});

app.listen(PORT, () => console.log(`GSR Audit service on :${PORT}`));
