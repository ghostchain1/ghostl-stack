import express from 'express';

const app  = express();
const PORT = process.env.PORT ?? 8100;

const ENGINE_URL     = process.env.ENGINE_URL     ?? 'http://gsx-engine:8090';
const COMPLIANCE_URL = process.env.COMPLIANCE_URL ?? 'http://gsx-compliance:8102';
const SETTLEMENT_URL = process.env.SETTLEMENT_URL ?? 'http://gsx-settlement:8101';
const RESERVE_URL    = process.env.RESERVE_URL    ?? 'http://gsx-reserve:8104';
const CBDC_URL       = process.env.CBDC_URL       ?? 'http://gsx-cbdc:8105';
const CUSTODY_URL    = process.env.CUSTODY_URL    ?? 'http://gsx-custody:8103';
const AUDIT_URL      = process.env.AUDIT_URL      ?? 'http://gsx-audit:8106';

app.use(express.json());

// ── Middleware: log every request ──
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// ── Middleware: require institution header ──
const requireInstitution = (req, res, next) => {
  if (!req.headers['x-institution-id']) {
    return res.status(401).json({ error: 'Missing X-Institution-Id header' });
  }
  next();
};

const proxy = async (url, method = 'GET', body = null) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return r.json();
};

// ── Health ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gsx-api', uptime: process.uptime() });
});

// ── Markets ──
app.get('/markets', async (req, res) => {
  try {
    const data = await proxy(`${ENGINE_URL}/markets`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/markets/:market/depth', async (req, res) => {
  try {
    const data = await proxy(`${ENGINE_URL}/depth/${req.params.market}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Orders ──
app.post('/orders', requireInstitution, async (req, res) => {
  try {
    const institution = req.headers['x-institution-id'];
    // Pre-check compliance
    const compCheck = await proxy(`${COMPLIANCE_URL}/check/${institution}`);
    if (!compCheck.approved) {
      return res.status(403).json({ error: 'Compliance not approved', details: compCheck });
    }
    // Submit to engine
    const order = { ...req.body, institution, id: req.body.id ?? crypto.randomUUID() };
    const result = await proxy(`${ENGINE_URL}/orders`, 'POST', order);
    // Audit log
    await proxy(`${AUDIT_URL}/log`, 'POST', {
      event: 'ORDER_SUBMITTED', institution, orderId: order.id,
      market: order.market, side: order.side, quantity: order.quantity
    }).catch(() => {});
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.delete('/orders/:market/:orderId', requireInstitution, async (req, res) => {
  try {
    const { market, orderId } = req.params;
    const result = await proxy(`${ENGINE_URL}/orders/${market}/${orderId}`, 'DELETE');
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Reserves ──
app.get('/reserves', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${RESERVE_URL}/reserves`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/reserves', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${RESERVE_URL}/reserves`, 'POST', req.body);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── CBDC ──
app.get('/cbdc/:currency', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${CBDC_URL}/currency/${req.params.currency}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/cbdc/mint', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${CBDC_URL}/mint`, 'POST', req.body);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Settlement ──
app.get('/settlements', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${SETTLEMENT_URL}/batches`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/settlements/flush', requireInstitution, async (req, res) => {
  try {
    const engineFlush = await proxy(`${ENGINE_URL}/settlement/flush`, 'POST');
    if (engineFlush.flushed && engineFlush.batch) {
      const settle = await proxy(`${SETTLEMENT_URL}/submit`, 'POST', engineFlush.batch);
      res.json({ ...engineFlush, onchain: settle });
    } else {
      res.json({ flushed: false, message: 'No pending trades' });
    }
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Custody ──
app.get('/custody/balance', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${CUSTODY_URL}/balance`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Compliance ──
app.get('/compliance/:address', requireInstitution, async (req, res) => {
  try {
    const data = await proxy(`${COMPLIANCE_URL}/check/${req.params.address}`);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`GSX API gateway listening on :${PORT}`));
