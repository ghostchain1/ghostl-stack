import WebSocket from 'ws';

export type EndpointStatus = 'OK' | 'DEGRADED' | 'DOWN';

export type RegistryChain = {
  chainName: string;
  layer: 'L1' | 'L2' | 'L3';
  chainId: number;
  rpc: string;
  ws?: string;
  region: string;
  type: 'execution' | 'rollup';
  gasToken: string;
  gasTokenAddress?: string;
  gasTokenName?: string;
  gasTokenDecimals?: number;
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: string;
  rpcUrls?: string[];
  wsUrls?: string[];
  chainKey?: string;
  chainType?: 'settlement' | 'rollup' | 'sidechain';
  network?: 'mainnet' | 'testnet' | 'devnet';
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  endpoints?: Array<{
    url: string;
    type: 'rpc' | 'archive' | 'indexer';
    protocol: 'http' | 'ws';
    auth: 'none' | 'apiKey' | 'bearer' | 'basic';
    region: string;
    priority: number;
    features: {
      archive: boolean;
      trace: boolean;
      debug: boolean;
      sequencer: boolean;
    };
    health: {
      status: 'healthy' | 'degraded' | 'down';
      latencyMs: number;
      lastChecked: string;
    };
  }>;
  explorers?: Array<{ name: string; url: string; standard: 'EIP3091' }>;
  metadata?: {
    rpcStandard: 'evm';
    evmCompatible: true;
    consensus: string;
  };
};

export type RegistryResponse = {
  registry: { name: string; version: string; generatedAt: string };
  chains: RegistryChain[];
  errors?: Array<{ chain: string; error: string }>;
};

type Endpoint = {
  chainId: number;
  url: string;
  protocol: 'http' | 'ws';
};

type EndpointHealth = {
  status: EndpointStatus;
  lastCheckedAt: string | null;
  lastCheckedMs: number | null;
  latencyMs: number | null;
  lastError: string | null;
  failures: number[];
  recoveryCount: number;
};

const parseList = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isPrivateUrl = (url: string) => {
  if (url.includes('localhost') || url.includes('127.0.0.1')) return true;
  try {
    const host = new URL(url).hostname;
    if (host.startsWith('10.') || host.startsWith('192.168.')) return true;
    const match = host.match(/^172\.(\d+)\./);
    if (match) {
      const octet = Number(match[1]);
      return octet >= 16 && octet <= 31;
    }
  } catch {
    return false;
  }
  return false;
};

const regionFor = (urls: string[]) => {
  if (urls.some((url) => isPrivateUrl(url))) return 'local';
  return 'global';
};

const CANONICAL_GAS_TOKEN_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CANONICAL_GAS_TOKEN_SYMBOL = 'GST';
const CANONICAL_GAS_TOKEN_NAME = 'Ghost Token';
const CANONICAL_GAS_TOKEN_DECIMALS = 18;

const requireCanonicalSymbol = (value: string | undefined, label: string) => {
  if (value && value !== CANONICAL_GAS_TOKEN_SYMBOL) {
    throw new Error(`${label} must be ${CANONICAL_GAS_TOKEN_SYMBOL}`);
  }
  return CANONICAL_GAS_TOKEN_SYMBOL;
};

const canonicalGasTokenAddress = () => {
  const configured = process.env.GAS_TOKEN_ADDRESS || CANONICAL_GAS_TOKEN_ADDRESS;
  if (configured.toLowerCase() !== CANONICAL_GAS_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error(`GAS_TOKEN_ADDRESS must be ${CANONICAL_GAS_TOKEN_ADDRESS}`);
  }
  return CANONICAL_GAS_TOKEN_ADDRESS;
};

const gasTokenFor = (layer: 'L1' | 'L2' | 'L3') => {
  if (layer === 'L1') return requireCanonicalSymbol(process.env.GAS_TOKEN_L1, 'GAS_TOKEN_L1');
  if (layer === 'L2') return requireCanonicalSymbol(process.env.GAS_TOKEN_L2, 'GAS_TOKEN_L2');
  return requireCanonicalSymbol(process.env.GAS_TOKEN_L3, 'GAS_TOKEN_L3');
};

const chainConfig = () => {
  const gasTokenAddress = canonicalGasTokenAddress();
  const l1Http = parseList(process.env.RPC_L1);
  const l1Ws = parseList(process.env.RPC_L1_WS);
  const l2Http = parseList(process.env.RPC_L2);
  const l2Ws = parseList(process.env.RPC_L2_WS);
  const l3Http = parseList(process.env.RPC_L3);
  const l3Ws = parseList(process.env.RPC_L3_WS);

  const l1Id = Number(process.env.RPC_L1_CHAIN_ID || process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101');
  const l2Id = Number(process.env.RPC_L2_CHAIN_ID || process.env.GHOSTL2_CHAIN_ID || process.env.CHAIN_ID || '901');
  const l3Id = Number(process.env.RPC_L3_CHAIN_ID || process.env.GHOSTL3_CHAIN_ID || '903');

  const chains: Array<{
    chainId: number;
    name: string;
    key: string;
    layer: 'L1' | 'L2' | 'L3';
    type: 'settlement' | 'rollup';
    http: string[];
    ws: string[];
    gasToken: string;
    gasTokenAddress: string;
  }> = [];
  chains.push({
    chainId: l1Id,
    name: 'GhostChain',
    key: 'ghostchain',
    layer: 'L1',
    type: 'settlement',
    http: l1Http,
    ws: l1Ws,
    gasToken: gasTokenFor('L1'),
    gasTokenAddress
  });
  chains.push({
    chainId: l2Id,
    name: 'GhostL2',
    key: 'ghostl2',
    layer: 'L2',
    type: 'rollup',
    http: l2Http,
    ws: l2Ws,
    gasToken: gasTokenFor('L2'),
    gasTokenAddress
  });
  chains.push({
    chainId: l3Id,
    name: 'GhostL3',
    key: 'ghostl3',
    layer: 'L3',
    type: 'rollup',
    http: l3Http,
    ws: l3Ws,
    gasToken: gasTokenFor('L3'),
    gasTokenAddress
  });
  return chains;
};

const networkFor = () => {
  const raw = (process.env.NET_ENV || '').toLowerCase();
  if (raw.includes('prod') || raw.includes('main')) return 'mainnet';
  if (raw.includes('test')) return 'testnet';
  return 'devnet';
};

const rpcCall = async (url: string, method: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message || 'rpc_error');
    if (!body.result) throw new Error('missing_chainId');
    return parseInt(body.result, 16);
  } finally {
    clearTimeout(timer);
  }
};

const wsCall = async (url: string, method: string, timeoutMs: number) =>
  new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('ws_timeout'));
    }, timeoutMs);
    socket.onopen = () => {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }));
    };
    socket.onmessage = (event) => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(String(event.data)) as { result?: string; error?: { message?: string } };
        if (data.error) {
          reject(new Error(data.error.message || 'rpc_error'));
          return;
        }
        if (!data.result) {
          reject(new Error('missing_chainId'));
          return;
        }
        resolve(parseInt(data.result, 16));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('ws_error'));
      } finally {
        socket.close();
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('ws_error'));
    };
  });

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HealthChecker {
  private endpoints: Endpoint[];
  private health: Map<string, EndpointHealth>;
  private intervalMs: number;
  private timeoutMs: number;
  private degradedMs: number;
  private retryCount: number;
  private cooldownMs: number;

  constructor(options: { intervalMs?: number; timeoutMs?: number; degradedMs?: number; retryCount?: number; cooldownMs?: number }) {
    const config = chainConfig();
    this.endpoints = config.flatMap((chain) => [
      ...chain.http.map((url) => ({ chainId: chain.chainId, url, protocol: 'http' as const })),
      ...chain.ws.map((url) => ({ chainId: chain.chainId, url, protocol: 'ws' as const }))
    ]);
    this.health = new Map(
      this.endpoints.map((endpoint) => [
        `${endpoint.chainId}:${endpoint.url}`,
        {
          status: 'DOWN',
          lastCheckedAt: null,
          lastCheckedMs: null,
          latencyMs: null,
          lastError: null,
          failures: [],
          recoveryCount: 0
        }
      ])
    );
    this.intervalMs = options.intervalMs ?? 60_000;
    this.timeoutMs = options.timeoutMs ?? 1500;
    this.degradedMs = options.degradedMs ?? 1200;
    this.retryCount = Math.max(0, options.retryCount ?? 1);
    this.cooldownMs = Math.max(0, options.cooldownMs ?? 15_000);
  }

  getRegistrySnapshot(): RegistryResponse {
    const errors: Array<{ chain: string; error: string }> = [];
    const chains = chainConfig().map((chain) => {
      const region = regionFor([...chain.http, ...chain.ws]);
      const network: RegistryChain['network'] = networkFor();
      const endpoints: NonNullable<RegistryChain['endpoints']> = [...chain.http, ...chain.ws].map((url) => {
        const health = this.health.get(`${chain.chainId}:${url}`);
        const status = health?.status === 'OK' ? 'healthy' : health?.status === 'DEGRADED' ? 'degraded' : 'down';
        return {
          url,
          type: 'rpc' as const,
          protocol: url.startsWith('ws') ? 'ws' as const : 'http' as const,
          auth: 'none' as const,
          region,
          priority: 1,
          features: { archive: false, trace: false, debug: false, sequencer: false },
          health: {
            status,
            latencyMs: health?.latencyMs ?? this.timeoutMs,
            lastChecked: health?.lastCheckedAt ?? nowIso()
          }
        };
      });

      if (!endpoints.length) {
        errors.push({ chain: chain.name, error: 'no_endpoints_configured' });
      }

      const statusList = endpoints.map((endpoint) => endpoint.health.status);
      const chainStatus: RegistryChain['status'] =
        !statusList.length
          ? 'down'
          : statusList.every((status) => status === 'healthy')
            ? 'healthy'
            : statusList.some((status) => status === 'healthy' || status === 'degraded')
              ? 'degraded'
              : 'down';

      const lastChecked =
        endpoints
          .map((endpoint) => Date.parse(endpoint.health.lastChecked))
          .filter((value) => Number.isFinite(value))
          .sort((a, b) => b - a)[0] || Date.now();

      const sortByHealth = (protocol: 'http' | 'ws') => {
        const order: Record<RegistryChain['status'], number> = { healthy: 0, degraded: 1, down: 2 };
        return endpoints
          .filter((endpoint) => endpoint.protocol === protocol)
          .sort((a, b) => order[a.health.status] - order[b.health.status]);
      };

      const httpPrimary = sortByHealth('http')[0]?.url || '';
      const wsPrimary = sortByHealth('ws')[0]?.url;

      const registryType: RegistryChain['type'] = chain.layer === 'L1' ? 'execution' : 'rollup';

      return {
        chainName: chain.name,
        layer: chain.layer,
        chainId: chain.chainId,
        rpc: httpPrimary || wsPrimary || '',
        ws: wsPrimary,
        region,
        type: registryType,
        gasToken: chain.gasToken,
        gasTokenAddress: chain.gasTokenAddress,
        gasTokenName: CANONICAL_GAS_TOKEN_NAME,
        gasTokenDecimals: CANONICAL_GAS_TOKEN_DECIMALS,
        status: chainStatus,
        lastChecked: new Date(lastChecked).toISOString(),
        rpcUrls: chain.http,
        wsUrls: chain.ws,
        chainKey: chain.key,
        chainType: chain.type,
        network,
        nativeCurrency: {
          name: CANONICAL_GAS_TOKEN_NAME,
          symbol: CANONICAL_GAS_TOKEN_SYMBOL,
          decimals: CANONICAL_GAS_TOKEN_DECIMALS
        },
        endpoints,
        explorers: [],
        metadata: {
          rpcStandard: 'evm' as const,
          evmCompatible: true as const,
          consensus: chain.layer === 'L1' ? 'PoS' : chain.layer === 'L2' ? 'OP Stack' : 'OP Stack L3'
        }
      };
    });
    return {
      registry: { name: 'GhostChain RPC Registry', version: '1.0.0', generatedAt: nowIso() },
      chains,
      errors: errors.length ? errors : undefined
    };
  }

  private recordFailure(key: string, error: string) {
    const entry = this.health.get(key);
    if (!entry) return;
    const now = Date.now();
    entry.failures = entry.failures.filter((ts) => now - ts < 60_000);
    entry.failures.push(now);
    entry.lastCheckedAt = nowIso();
    entry.lastCheckedMs = now;
    entry.latencyMs = entry.latencyMs ?? this.timeoutMs;
    entry.lastError = error;
    entry.recoveryCount = 0;
    entry.status = entry.failures.length >= 3 ? 'DOWN' : 'DEGRADED';
  }

  private recordSuccess(key: string, latencyMs: number) {
    const entry = this.health.get(key);
    if (!entry) return;
    const now = Date.now();
    entry.lastCheckedAt = nowIso();
    entry.lastCheckedMs = now;
    entry.latencyMs = latencyMs;
    entry.lastError = null;
    entry.failures = [];
    if (entry.status === 'DOWN') {
      entry.recoveryCount += 1;
      if (entry.recoveryCount >= 2) {
        entry.status = latencyMs > this.degradedMs ? 'DEGRADED' : 'OK';
        entry.recoveryCount = 0;
      }
    } else {
      entry.status = latencyMs > this.degradedMs ? 'DEGRADED' : 'OK';
    }
  }

  private shouldSkip(key: string) {
    const entry = this.health.get(key);
    if (!entry || entry.status !== 'DOWN') return false;
    if (!entry.lastCheckedMs) return false;
    return Date.now() - entry.lastCheckedMs < this.cooldownMs;
  }

  private async probeEndpoint(endpoint: Endpoint, key: string) {
    let attempt = 0;
    let lastError = 'probe_failed';
    while (attempt <= this.retryCount) {
      const started = Date.now();
      try {
        const chainId =
          endpoint.protocol === 'ws'
            ? await wsCall(endpoint.url, 'eth_chainId', this.timeoutMs)
            : await rpcCall(endpoint.url, 'eth_chainId', this.timeoutMs);
        const blockNumber =
          endpoint.protocol === 'ws'
            ? await wsCall(endpoint.url, 'eth_blockNumber', this.timeoutMs)
            : await rpcCall(endpoint.url, 'eth_blockNumber', this.timeoutMs);
        if (chainId !== endpoint.chainId) throw new Error('chainId_mismatch');
        if (!Number.isFinite(blockNumber)) throw new Error('blockNumber_invalid');
        this.recordSuccess(key, Date.now() - started);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'probe_failed';
        attempt += 1;
        if (attempt <= this.retryCount) {
          await sleep(100 * attempt);
        }
      }
    }
    this.recordFailure(key, lastError);
  }

  async runOnce() {
    for (const endpoint of this.endpoints) {
      const key = `${endpoint.chainId}:${endpoint.url}`;
      if (this.shouldSkip(key)) continue;
      await this.probeEndpoint(endpoint, key);
    }
  }

  start() {
    void this.runOnce();
    setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
  }
}
