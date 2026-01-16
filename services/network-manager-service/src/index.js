import express from 'express';
import net from 'net';

const PORT = Number(process.env.NETWORK_MANAGER_PORT || '7766');
const MONITOR_HOST = process.env.MONITOR_HOST || 'localhost';
const RPC_L1 = process.env.MONITOR_RPC_L1 || process.env.RPC_L1 || 'http://localhost:18545';
const RPC_L2 = process.env.MONITOR_RPC_L2 || process.env.RPC_L2 || 'http://localhost:29547';
const RPC_L3 = process.env.MONITOR_RPC_L3 || process.env.RPC_L3 || 'http://localhost:39545';
const PORTS = (process.env.MONITOR_PORTS || '7070,7171,29547,39545').split(',').map(p => Number(p.trim())).filter(Boolean);
const HEALTH_ENDPOINTS = (process.env.MONITOR_HEALTH_ENDPOINTS || '').split(',').map(h => h.trim()).filter(Boolean);

const app = express();
app.use(express.json());

const state = {
  lastRun: null,
  results: [],
  errors: [],
};

async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data;
}

function checkPort(host, port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let done = false;
    const onResult = (ok, error) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ok, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', err => onResult(false, err.message));
    socket.once('timeout', () => onResult(false, 'timeout'));
    socket.connect(port, host, () => onResult(true));
  });
}

async function probe() {
  const results = [];
  const errors = [];
  const rpcTargets = [
    { name: 'l1', url: RPC_L1 },
    { name: 'l2', url: RPC_L2 },
    { name: 'l3', url: RPC_L3 }
  ];

  for (const t of rpcTargets) {
    try {
      const data = await fetchJson(t.url, { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
      results.push({ target: t.name, type: 'rpc', ok: true, detail: data.result });
    } catch (e) {
      errors.push({ target: t.name, type: 'rpc', error: e.message, url: t.url });
      results.push({ target: t.name, type: 'rpc', ok: false, error: e.message });
    }
  }

  for (const p of PORTS) {
    const r = await checkPort(MONITOR_HOST, p);
    results.push({ target: `${MONITOR_HOST}:${p}`, type: 'port', ...r });
    if (!r.ok) errors.push({ target: `${MONITOR_HOST}:${p}`, type: 'port', error: r.error });
  }

  for (const h of HEALTH_ENDPOINTS) {
    try {
      const res = await fetch(h);
      const ok = res.ok;
      const body = await res.text();
      results.push({ target: h, type: 'health', ok, status: res.status, body: body.slice(0, 200) });
      if (!ok) errors.push({ target: h, type: 'health', error: `HTTP ${res.status}` });
    } catch (e) {
      results.push({ target: h, type: 'health', ok: false, error: e.message });
      errors.push({ target: h, type: 'health', error: e.message });
    }
  }

  state.lastRun = Date.now();
  state.results = results;
  state.errors = errors;
}

setInterval(probe, Number(process.env.MONITOR_INTERVAL_MS || '10000'));
probe().catch(() => {});

function summarize() {
  const failed = state.results.filter(r => r.ok === false);
  const suggestions = [];
  if (failed.some(r => r.type === 'rpc')) suggestions.push('Check RPC endpoints, restart op-node/op-geth if unresponsive.');
  if (failed.some(r => r.type === 'port')) suggestions.push('Port unreachable; check docker-proxy or host firewall.');
  if (failed.some(r => r.type === 'health')) suggestions.push('Service health failing; inspect container logs.');
  if (suggestions.length === 0) suggestions.push('All monitored checks are OK.');
  return { failed, suggestions };
}

app.get('/health', (_req, res) => {
  res.json({ ok: state.errors.length === 0, lastRun: state.lastRun, errors: state.errors.slice(0, 20) });
});

app.get('/status', (_req, res) => {
  res.json({ ok: state.errors.length === 0, lastRun: state.lastRun, results: state.results, summary: summarize() });
});

app.post('/remediate/dry-run', (_req, res) => {
  res.json({ ok: true, note: 'No direct remediation executed (dry-run only)', suggestions: summarize().suggestions });
});

const server = app.listen(PORT, () => {
  console.log(`[netmgr] listening on :${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
