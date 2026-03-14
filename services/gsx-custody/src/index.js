import express from 'express';
import crypto from 'crypto';

const app  = express();
const PORT = process.env.PORT ?? 8103;

app.use(express.json());

const REQUIRED_APPROVALS = parseInt(process.env.REQUIRED_APPROVALS ?? '3');

const balances  = new Map(); // token -> amount
const requests  = new Map(); // reqId -> request object
let   reqSeq    = 0;
const custodians = new Set(
  (process.env.CUSTODIANS ?? '').split(',').filter(Boolean)
);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gsx-custody', required: REQUIRED_APPROVALS }));

app.get('/balance', (req, res) => {
  res.json({ balances: Object.fromEntries(balances) });
});

app.post('/deposit', (req, res) => {
  const { token, amount } = req.body;
  if (!token || !amount) return res.status(400).json({ error: 'token and amount required' });
  balances.set(token, (balances.get(token) ?? 0n) + BigInt(amount));
  res.json({ deposited: true, token, totalBalance: String(balances.get(token)) });
});

app.post('/request-withdrawal', (req, res) => {
  const { token, recipient, amount, requestedBy } = req.body;
  if (!token || !recipient || !amount) return res.status(400).json({ error: 'token, recipient, amount required' });
  const reqId = `req-${++reqSeq}-${crypto.randomBytes(4).toString('hex')}`;
  requests.set(reqId, {
    reqId, token, recipient, amount: BigInt(amount), requestedBy,
    approvals: new Set(), executed: false, createdAt: Date.now()
  });
  console.log(`Withdrawal request ${reqId}: ${amount} ${token} → ${recipient}`);
  res.json({ reqId, status: 'pending', required: REQUIRED_APPROVALS });
});

app.post('/approve-withdrawal', (req, res) => {
  const { reqId, custodian } = req.body;
  const req_ = requests.get(reqId);
  if (!req_) return res.status(404).json({ error: 'request not found' });
  if (req_.executed) return res.status(400).json({ error: 'already executed' });
  req_.approvals.add(custodian);
  const approvalCount = req_.approvals.size;
  console.log(`Request ${reqId} approved by ${custodian} (${approvalCount}/${REQUIRED_APPROVALS})`);
  if (approvalCount >= REQUIRED_APPROVALS) {
    const bal = balances.get(req_.token) ?? 0n;
    if (bal < req_.amount) return res.status(400).json({ error: 'insufficient vault balance' });
    balances.set(req_.token, bal - req_.amount);
    req_.executed = true;
    req_.executedAt = Date.now();
    console.log(`Request ${reqId} EXECUTED: released ${req_.amount} ${req_.token} to ${req_.recipient}`);
    return res.json({ executed: true, reqId, txRef: '0x' + crypto.randomBytes(32).toString('hex') });
  }
  res.json({ approved: true, reqId, approvalCount, remaining: REQUIRED_APPROVALS - approvalCount });
});

app.get('/requests', (req, res) => {
  const list = Array.from(requests.values()).map(r => ({
    ...r, amount: String(r.amount), approvals: Array.from(r.approvals)
  }));
  res.json({ requests: list });
});

app.listen(PORT, () => console.log(`GSX Custody vault service on :${PORT}`));
