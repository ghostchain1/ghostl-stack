import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8140;

app.use(express.json());

const policies = new Map();
const POLICY_TYPES = ['TRADE_SANCTIONS', 'CAPITAL_CONTROLS', 'RESERVE_REQUIREMENTS', 'CBDC_INTEROP', 'AML_STANDARD', 'SETTLEMENT_RULE', 'EMERGENCY'];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gwf-policy', policyCount: policies.size }));

app.get('/policy-types', (req, res) => res.json({ types: POLICY_TYPES }));

app.get('/policies', (req, res) => {
  const type = req.query.type;
  const now  = Date.now();
  let list = Array.from(policies.values()).filter(p => !p.revokedAt && (!p.expiresAt || p.expiresAt > now));
  if (type) list = list.filter(p => p.policyType === type.toUpperCase());
  res.json({ policies: list, count: list.length });
});

app.get('/policies/:id', (req, res) => {
  const p = policies.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

app.post('/policies', (req, res) => {
  const { policyType, title, description, effectiveAt, expiresAt, issuer, scope, directives } = req.body;
  if (!policyType || !title || !issuer) return res.status(400).json({ error: 'policyType, title, issuer required' });
  if (!POLICY_TYPES.includes(policyType.toUpperCase())) {
    return res.status(400).json({ error: `policyType must be one of: ${POLICY_TYPES.join(', ')}` });
  }
  const id = 'pol-' + crypto.randomUUID();
  const policy = {
    id, policyType: policyType.toUpperCase(), title, description,
    effectiveAt: effectiveAt ? Number(effectiveAt) : Date.now(),
    expiresAt: expiresAt ? Number(expiresAt) : null,
    issuer, scope: scope ?? 'GLOBAL', directives: directives ?? {},
    status: 'ACTIVE', issuedAt: Date.now(), revokedAt: null,
  };
  policies.set(id, policy);
  console.log(`Policy issued: ${id} (${policyType}) by ${issuer}`);
  res.status(201).json(policy);
});

app.post('/policies/:id/revoke', (req, res) => {
  const p = policies.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  p.revokedAt = Date.now();
  p.revokedBy = req.body.revokedBy ?? 'admin';
  p.status = 'REVOKED';
  res.json({ revoked: true, id: p.id });
});

app.listen(PORT, () => console.log(`GWF Policy service on :${PORT}`));
