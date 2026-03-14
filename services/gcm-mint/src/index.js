import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8122;
const CBDC_URL = process.env.CBDC_URL ?? 'http://gsx-cbdc:8105';
const GCM_NODE_URL = process.env.GCM_NODE_URL ?? 'http://gcm-node:8120';

app.use(express.json());

const mintRequests = [];
const mintedTotals = new Map();

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gcm-mint' }));

app.get('/totals', (req, res) => {
  res.json({ totals: Object.fromEntries(mintedTotals), requestCount: mintRequests.length });
});

app.post('/mint', async (req, res) => {
  const { centralBank, currency, recipient, amount, purpose, authorizedBy } = req.body;
  if (!centralBank || !currency || !recipient || !amount) {
    return res.status(400).json({ error: 'centralBank, currency, recipient, amount required' });
  }

  const requestId = 'mint-' + crypto.randomUUID();
  const request = {
    requestId, centralBank, currency: currency.toUpperCase(),
    recipient, amount: Number(amount), purpose, authorizedBy,
    status: 'PENDING', createdAt: Date.now()
  };

  mintRequests.push(request);

  try {
    // Call CBDC service to mint tokens
    const cbdcResp = await fetch(`${CBDC_URL}/mint`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: `${currency.toUpperCase()}-CBDC`, recipient, amount, centralBank })
    });
    const cbdcResult = await cbdcResp.json();
    request.status = 'COMPLETED';
    request.txHash = cbdcResult.txHash;
    request.completedAt = Date.now();

    const sym = currency.toUpperCase();
    mintedTotals.set(sym, (mintedTotals.get(sym) ?? 0) + Number(amount));

    // Broadcast mint event to GCM network
    fetch(`${GCM_NODE_URL}/broadcast`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CBDC_MINTED', payload: { currency: sym, amount, recipient, requestId } })
    }).catch(() => {});

    console.log(`CBDC MINT COMPLETED: ${requestId} — ${amount} ${currency}-CBDC → ${recipient}`);
    res.json({ requestId, status: 'COMPLETED', txHash: cbdcResult.txHash });
  } catch (e) {
    request.status = 'FAILED';
    request.error = e.message;
    res.status(502).json({ requestId, status: 'FAILED', error: e.message });
  }
});

app.get('/requests', (req, res) => {
  const status = req.query.status;
  let list = mintRequests;
  if (status) list = list.filter(r => r.status === status);
  res.json({ requests: list.slice(-100) });
});

app.listen(PORT, () => console.log(`GCM Mint orchestrator on :${PORT}`));
