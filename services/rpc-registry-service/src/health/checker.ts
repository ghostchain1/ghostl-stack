import WebSocket from 'ws';

export type EndpointStatus = 'OK' | 'DEGRADED' | 'DOWN';

export type ChainEntry = {
  chainId: number;
  chainKey: string;
  chainName: string;
  layer: 'L1' | 'L2' | 'L3';
  chainType: 'settlement' | 'rollup' | 'sidechain';
  network: 'mainnet' | 'testnet' | 'devnet';
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  regions: string[];
  endpoints: Array<{
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
  explorers: Array<{ name: string; url: string; standard: 'EIP3091' }>;
  metadata: {
    rpcStandard: 'ethereum';
    evmCompatible: true;
    consensus: string;
  };
};

export type RegistryResponse = {
  registry: { name: string; version: string; generatedAt: string };
  chains: ChainEntry[];
};

type Endpoint = {
  chainId: number;
  url: string;
  protocol: 'http' | 'ws';
};

type EndpointHealth = {
  status: EndpointStatus;
  lastCheckedAt: string | null;
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

const chainConfig = () => {
  const l1Http = parseList(process.env.RPC_L1);
  const l1Ws = parseList(process.env.RPC_L1_WS);
  const l2Http = parseList(process.env.RPC_L2);
  const l2Ws = parseList(process.env.RPC_L2_WS);
  const l3Http = parseList(process.env.RPC_L3);
  const l3Ws = parseList(process.env.RPC_L3_WS);

  const l1Id = Number(process.env.RPC_L1_CHAIN_ID || process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101');
  const l2Id = Number(process.env.RPC_L2_CHAIN_ID || process.env.GHOSTL2_CHAIN_ID || process.env.CHAIN_ID || '901');
  const l3Id = Number(process.env.RPC_L3_CHAIN_ID || process.env.GHOSTL3_CHAIN_ID || '903');

  const chains: Array<{ chainId: number; name: string; key: string; layer: 'L1' | 'L2' | 'L3'; type: 'settlement' | 'rollup'; http: string[]; ws: string[] }> = [];
  if (l1Http.length || l1Ws.length) chains.push({ chainId: l1Id, name: 'GhostChain', key: 'ghostchain', layer: 'L1', type: 'settlement', http: l1Http, ws: l1Ws });
  if (l2Http.length || l2Ws.length) chains.push({ chainId: l2Id, name: 'GhostL2', key: 'ghostl2', layer: 'L2', type: 'rollup', http: l2Http, ws: l2Ws });
  if (l3Http.length || l3Ws.length) chains.push({ chainId: l3Id, name: 'GhostL3', key: 'ghostl3', layer: 'L3', type: 'rollup', http: l3Http, ws: l3Ws });
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

export class HealthChecker {
  private endpoints: Endpoint[];
  private health: Map<string, EndpointHealth>;
  private intervalMs: number;
  private timeoutMs: number;
  private degradedMs: number;

  constructor(options: { intervalMs?: number; timeoutMs?: number; degradedMs?: number }) {
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
  }

  getRegistrySnapshot(): RegistryResponse {
    const chains = chainConfig().map((chain) => {
      const region = regionFor([...chain.http, ...chain.ws]);
      const network = networkFor();
      const endpoints = [...chain.http, ...chain.ws].map((url) => {
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
      return {
        chainId: chain.chainId,
        chainKey: chain.key,
        chainName: chain.name,
        layer: chain.layer,
        chainType: chain.type,
        network,
        nativeCurrency: {
          name: 'Ghost',
          symbol: 'GHOST',
          decimals: 18
        },
        regions: [region],
        endpoints,
        explorers: [],
        metadata: {
          rpcStandard: 'ethereum',
          evmCompatible: true,
          consensus: chain.layer === 'L1' ? 'PoS' : chain.layer === 'L2' ? 'OP Stack' : 'OP Stack L3'
        }
      };
    });
    return {
      registry: { name: 'GhostChain RPC Registry', version: '1.0.0', generatedAt: nowIso() },
      chains
    };
  }

  private recordFailure(key: string, error: string) {
    const entry = this.health.get(key);
    if (!entry) return;
    const now = Date.now();
    entry.failures = entry.failures.filter((ts) => now - ts < 60_000);
    entry.failures.push(now);
    entry.lastCheckedAt = nowIso();
    entry.latencyMs = entry.latencyMs ?? this.timeoutMs;
    entry.lastError = error;
    entry.recoveryCount = 0;
    entry.status = entry.failures.length >= 3 ? 'DOWN' : 'DEGRADED';
  }

  private recordSuccess(key: string, latencyMs: number) {
    const entry = this.health.get(key);
    if (!entry) return;
    entry.lastCheckedAt = nowIso();
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

  async runOnce() {
    for (const endpoint of this.endpoints) {
      const key = `${endpoint.chainId}:${endpoint.url}`;
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
      } catch (err) {
        this.recordFailure(key, err instanceof Error ? err.message : 'probe_failed');
      }
    }
  }

  start() {
    void this.runOnce();
    setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
  }
}
