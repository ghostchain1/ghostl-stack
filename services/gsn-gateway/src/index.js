import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8110;
const SETTLEMENT_URL = process.env.SETTLEMENT_URL ?? 'http://gsn-settlement:8111';

app.use(express.json());

const GATEWAY_ID  = process.env.GATEWAY_ID ?? 'GSN-GW-DEFAULT';
const authorizedNodes = new Set((process.env.PEER_NODES ?? '').split(',').filter(Boolean));
const messageLog = [];

const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'CHF', 'AED', 'SAR'];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gsn-gateway', gatewayId: GATEWAY_ID, peers: authorizedNodes.size });
});

app.get('/gateway-info', (req, res) => {
  res.json({ gatewayId: GATEWAY_ID, supportedCurrencies: CURRENCIES, messageCount: messageLog.length });
});

app.post('/submit', async (req, res) => {
  const { msgId, from, to, currency, amount, purpose, senderRef } = req.body;
  if (!from || !to || !currency || !amount) {
    return res.status(400).json({ error: 'from, to, currency, amount required' });
  }
  if (!CURRENCIES.includes(currency.toUpperCase())) {
    return res.status(400).json({ error: `unsupported currency, use: ${CURRENCIES.join(', ')}` });
  }

  const id = msgId ?? crypto.randomUUID();
  const msg = {
    id, from, to, currency: currency.toUpperCase(), amount: Number(amount),
    purpose: purpose ?? 'cross-border-settlement', senderRef,
    gatewayId: GATEWAY_ID, status: 'RECEIVED', receivedAt: Date.now()
  };
  messageLog.push(msg);
  console.log(`GSN instruction ${id}: ${amount} ${currency} ${from} → ${to}`);

  // Forward to settlement engine
  try {
    const result = await fetch(`${SETTLEMENT_URL}/settle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg)
    });
    const settled = await result.json();
    msg.status = 'FORWARDED';
    return res.json({ received: true, id, settled });
  } catch (e) {
    msg.status = 'PENDING';
    return res.json({ received: true, id, forwarded: false, reason: e.message });
  }
});

app.get('/messages', (req, res) => {
  const status = req.query.status;
  let list = messageLog;
  if (status) list = list.filter(m => m.status === status);
  res.json({ messages: list.slice(-100), count: list.length });
});

app.listen(PORT, () => console.log(`GSN Gateway ${GATEWAY_ID} on :${PORT}`));
