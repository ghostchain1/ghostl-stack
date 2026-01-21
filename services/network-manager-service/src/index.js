import express from 'express';
import net from 'net';

const PORT = Number(process.env.NETWORK_MANAGER_PORT || '7766');
const MONITOR_HOST = process.env.MONITOR_HOST || 'localhost';
const registryUrl = process.env.RPC_REGISTRY_URL || 'http://ghost-registry:8088/v1/endpoints';
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || '1500');
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || '2'));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || '30000'));
const registryCache = { data: null, expiresAt: 0 };
const PORTS = (process.env.MONITOR_PORTS || '7070,7171,18545,18547,39545').split(',').map(p => Number(p.trim())).filter(Boolean);
const HEALTH_ENDPOINTS = (process.env.MONITOR_HEALTH_ENDPOINTS || '').split(',').map(h => h.trim()).filter(Boolean);

const app = express();
app.use(express.json());

const state = {
  lastRun: null,
  results: [],
  errors: [],
};

let rpcTargets = [];

async function fetchRegistry() {
  const now = Date.now();
  if (registryCache.data && registryCache.expiresAt > now) return registryCache.data;
  let lastErr;
  for (let attempt = 0; attempt <= registryRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), registryTimeoutMs);
    try {
      const res = await fetch(registryUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`registry_http_${res.status}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.chains)) throw new Error('registry_invalid');
      registryCache.data = body;
      registryCache.expiresAt = now + registryCacheMs;
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < registryRetries) await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('registry_unavailable');
}

function pickRpc(chain) {
  if (!chain) return '';
  if (typeof chain.rpc === 'string' && chain.rpc) return chain.rpc;
  if (Array.isArray(chain.rpcUrls) && chain.rpcUrls.length) return chain.rpcUrls[0];
  if (Array.isArray(chain.endpoints)) {
    const http = chain.endpoints.find((endpoint) => endpoint.protocol === 'http');
    if (http?.url) return http.url;
  }
  if (typeof chain.ws === 'string' && chain.ws) return chain.ws;
  if (Array.isArray(chain.wsUrls) && chain.wsUrls.length) return chain.wsUrls[0];
  return '';
}

async function resolveRpc(layer, override) {
  const registry = await fetchRegistry();
  const chain = registry.chains.find((entry) => entry.layer === layer);
  const allowed = new Set([
    ...(typeof chain?.rpc === 'string' && chain.rpc ? [chain.rpc] : []),
    ...(Array.isArray(chain?.rpcUrls) ? chain.rpcUrls : []),
    ...(Array.isArray(chain?.endpoints) ? chain.endpoints.map((endpoint) => endpoint.url) : [])
  ]);
  if (override) {
    if (!allowed.has(override)) throw new Error('rpc_override_not_in_registry');
    return override;
  }
  const rpc = pickRpc(chain);
  if (!rpc) throw new Error(`rpc_missing_${layer.toLowerCase()}`);
  return rpc;
}

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

async function init() {
  try {
    const [l1, l2, l3] = await Promise.all([
      resolveRpc('L1', process.env.MONITOR_RPC_L1),
      resolveRpc('L2', process.env.MONITOR_RPC_L2),
      resolveRpc('L3', process.env.MONITOR_RPC_L3)
    ]);
    rpcTargets = [
      { name: 'l1', url: l1 },
      { name: 'l2', url: l2 },
      { name: 'l3', url: l3 }
    ];
    const intervalMs = Number(process.env.MONITOR_INTERVAL_MS || '10000');
    setInterval(probe, intervalMs);
    probe().catch(() => {});
    const server = app.listen(PORT, () => {
      console.log(`[netmgr] listening on :${PORT}`);
    });
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  } catch (err) {
    console.error(`[netmgr] registry error: ${err?.message || err}`);
    process.exit(1);
  }
}

init();
