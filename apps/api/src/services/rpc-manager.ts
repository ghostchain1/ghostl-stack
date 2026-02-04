import { JsonRpcProvider } from 'ethers';
import WebSocket from 'ws';
import { env } from '../config/env';

type ChainRef = 'l1' | 'l2' | 'l3';
type ChainLayer = 'L1' | 'L2' | 'L3';
type EndpointStatus = 'OK' | 'DEGRADED' | 'DOWN';

type RegistryResponse = {
  registry?: {
    name: string;
    version: string;
    generatedAt: string;
  };
  chains: Array<{
    chainId: number;
    chainKey?: string;
    chainName?: string;
    name?: string;
    layer: 'L1' | 'L2' | 'L3';
    chainType?: 'settlement' | 'rollup' | 'sidechain';
    network?: 'mainnet' | 'testnet' | 'devnet';
    regions?: string[];
    nativeCurrency?: { name: string; symbol: string; decimals: number };
    rpc?: { http?: string[]; ws?: string[] } | string;
    ws?: string;
    rpcUrls?: string[];
    wsUrls?: string[];
    endpoints?: Array<{ url: string; protocol?: 'http' | 'ws' }>;
  }>;
};

type Endpoint = {
  chainId: number;
  url: string;
  protocol: 'http' | 'ws';
  status: EndpointStatus;
  failures: number[];
  recoveryCount: number;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
};

const nowIso = () => new Date().toISOString();

const chainForLayer = (layer: ChainRef) => (layer === 'l1' ? 'L1' : layer === 'l2' ? 'L2' : 'L3');
const normalizeLayer = (layer: ChainLayer | ChainRef) =>
  layer === 'l1' || layer === 'L1' ? 'l1' : layer === 'l2' || layer === 'L2' ? 'l2' : 'l3';

const isValidRegistry = (payload: unknown): payload is RegistryResponse => {
  if (!payload || typeof payload !== 'object') return false;
  const chains = (payload as { chains?: unknown }).chains;
  if (!Array.isArray(chains) || !chains.length) return false;
  return chains.every((chain) => {
    if (!chain || typeof chain !== 'object') return false;
    const entry = chain as RegistryResponse['chains'][number];
    if (!Number.isFinite(entry.chainId)) return false;
    if (!entry.layer || !['L1', 'L2', 'L3'].includes(entry.layer)) return false;
    if (entry.rpc) {
      if (typeof entry.rpc !== 'string') {
        if (entry.rpc.http && !Array.isArray(entry.rpc.http)) return false;
        if (entry.rpc.ws && !Array.isArray(entry.rpc.ws)) return false;
      }
    }
    if (entry.rpcUrls && !Array.isArray(entry.rpcUrls)) return false;
    if (entry.wsUrls && !Array.isArray(entry.wsUrls)) return false;
    if (entry.endpoints && !Array.isArray(entry.endpoints)) return false;
    return true;
  });
};

const rpcChainId = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
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

const rpcBlockNumber = async (url: string, timeoutMs: number) => {
  const isMethodNotFound = (err: unknown) => {
    const code = typeof (err as { code?: unknown })?.code === 'number' ? (err as { code: number }).code : undefined;
    if (code === -32601) return true;
    const msg = String((err as { message?: unknown })?.message ?? err)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return msg.includes('method not found') || msg.includes('does not exist') || msg.includes('not available');
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const call = async (method: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const body = (await res.json()) as { result?: string; error?: { message?: string; code?: number } };
      if (body.error) {
        const err = new Error(body.error.message || 'rpc_error') as Error & { code?: number };
        err.code = body.error.code;
        throw err;
      }
      if (!body.result) throw new Error('missing_blockNumber');
      return parseInt(body.result, 16);
    };

    try {
      return await call('gst_blockNumber');
    } catch (err) {
      if (!isMethodNotFound(err)) throw err;
      return await call('eth_blockNumber');
    }
  } finally {
    clearTimeout(timer);
  }
};

const wsChainId = async (url: string, timeoutMs: number) =>
  new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('ws_timeout'));
    }, timeoutMs);
    socket.onopen = () => {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }));
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

const wsBlockNumber = async (url: string, timeoutMs: number) =>
  new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(url);
    const isMethodNotFound = (err: unknown) => {
      const code = typeof (err as { code?: unknown })?.code === 'number' ? (err as { code: number }).code : undefined;
      if (code === -32601) return true;
      const msg = String((err as { message?: unknown })?.message ?? err)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
      return msg.includes('method not found') || msg.includes('does not exist') || msg.includes('not available');
    };

    const send = (method: string, id: number) => socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: [] }));

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('ws_timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.close();
    };

    let triedEth = false;
    socket.onopen = () => {
      send('gst_blockNumber', 1);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as { result?: string; error?: { message?: string; code?: number } };
        if (data.error) {
          const err = new Error(data.error.message || 'rpc_error') as Error & { code?: number };
          err.code = data.error.code;
          if (!triedEth && isMethodNotFound(err)) {
            triedEth = true;
            try {
              send('eth_blockNumber', 2);
            } catch (sendErr) {
              cleanup();
              reject(sendErr instanceof Error ? sendErr : new Error('ws_error'));
            }
            return;
          }
          cleanup();
          reject(err);
          return;
        }
        if (!data.result) {
          cleanup();
          reject(new Error('missing_blockNumber'));
          return;
        }
        cleanup();
        resolve(parseInt(data.result, 16));
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('ws_error'));
      }
    };
    socket.onerror = () => {
      cleanup();
      reject(new Error('ws_error'));
    };
  });

export class GhostWalletRpcManager {
  private registryUrl: string | undefined;
  private registryAvailable = false;
  private endpoints: Map<ChainRef, Endpoint[]> = new Map();
  private refreshIntervalMs: number;
  private probeIntervalMs: number;
  private timeoutMs: number;
  private degradedMs: number;

  constructor(options?: { registryUrl?: string; refreshIntervalMs?: number; probeIntervalMs?: number; timeoutMs?: number; degradedMs?: number }) {
    this.registryUrl = options?.registryUrl || env.RPC_REGISTRY_URL;
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 120_000;
    this.probeIntervalMs = options?.probeIntervalMs ?? 30_000;
    this.timeoutMs = options?.timeoutMs ?? 1500;
    this.degradedMs = options?.degradedMs ?? 1200;
    this.refresh().catch(() => undefined);
    setInterval(() => void this.refresh(), this.refreshIntervalMs);
    setInterval(() => void this.probeAll(), this.probeIntervalMs);
  }

  private initEndpoints(data: RegistryResponse) {
    const next = new Map<ChainRef, Endpoint[]>();
    (['l1', 'l2', 'l3'] as ChainRef[]).forEach((layer) => {
      const entry = data.chains.find((chain) => chain.layer === chainForLayer(layer));
      if (!entry) return;
      const http: string[] = [];
      const ws: string[] = [];
      if (typeof entry.rpc === 'string' && entry.rpc) http.push(entry.rpc);
      if (typeof entry.ws === 'string' && entry.ws) ws.push(entry.ws);
      if (entry.rpcUrls?.length) http.push(...entry.rpcUrls);
      if (entry.wsUrls?.length) ws.push(...entry.wsUrls);
      if (entry.rpc && typeof entry.rpc !== 'string') {
        if (entry.rpc.http) http.push(...entry.rpc.http);
        if (entry.rpc.ws) ws.push(...entry.rpc.ws);
      }
      const httpUrls = Array.from(new Set(http.filter(Boolean)));
      const wsUrls = Array.from(new Set(ws.filter(Boolean)));
      const endpointUrls = entry.endpoints || [];
      const endpoints: Endpoint[] = [
        ...httpUrls.map((url) => ({
          chainId: entry.chainId,
          url,
          protocol: 'http' as const,
          status: 'DEGRADED' as EndpointStatus,
          failures: [],
          recoveryCount: 0,
          lastCheckedAt: null,
          latencyMs: null,
          lastError: null
        })),
        ...wsUrls.map((url) => ({
          chainId: entry.chainId,
          url,
          protocol: 'ws' as const,
          status: 'DEGRADED' as EndpointStatus,
          failures: [],
          recoveryCount: 0,
          lastCheckedAt: null,
          latencyMs: null,
          lastError: null
        })),
        ...endpointUrls
          .filter((endpoint) => endpoint.url)
          .map((endpoint) => ({
            chainId: entry.chainId,
            url: endpoint.url,
            protocol: (endpoint.protocol || (endpoint.url.startsWith('ws') ? 'ws' : 'http')) as 'ws' | 'http',
            status: 'DEGRADED' as EndpointStatus,
            failures: [],
            recoveryCount: 0,
            lastCheckedAt: null,
            latencyMs: null,
            lastError: null
          }))
      ];
      next.set(layer, endpoints);
    });
    this.endpoints = next;
  }

  private async refresh() {
    if (!this.registryUrl) {
      this.registryAvailable = false;
      this.endpoints = new Map();
      return;
    }
    try {
      const res = await fetch(this.registryUrl);
      if (!res.ok) throw new Error('registry_unavailable');
      const body = (await res.json()) as unknown;
      if (!isValidRegistry(body)) throw new Error('invalid_registry');
      this.registryAvailable = true;
      this.initEndpoints(body);
    } catch {
      this.registryAvailable = false;
      this.endpoints = new Map();
    }
  }

  private recordFailure(endpoint: Endpoint, error: string) {
    const now = Date.now();
    endpoint.failures = endpoint.failures.filter((ts) => now - ts < 60_000);
    endpoint.failures.push(now);
    endpoint.lastCheckedAt = nowIso();
    endpoint.lastError = error;
    endpoint.recoveryCount = 0;
    endpoint.status = endpoint.failures.length >= 3 ? 'DOWN' : 'DEGRADED';
  }

  private recordSuccess(endpoint: Endpoint, latencyMs: number) {
    endpoint.lastCheckedAt = nowIso();
    endpoint.latencyMs = latencyMs;
    endpoint.lastError = null;
    endpoint.failures = [];
    if (endpoint.status === 'DOWN') {
      endpoint.recoveryCount += 1;
      if (endpoint.recoveryCount >= 2) {
        endpoint.status = latencyMs > this.degradedMs ? 'DEGRADED' : 'OK';
        endpoint.recoveryCount = 0;
      }
    } else {
      endpoint.status = latencyMs > this.degradedMs ? 'DEGRADED' : 'OK';
    }
  }

  private async probe(endpoint: Endpoint) {
    const started = Date.now();
    try {
      const chainId =
        endpoint.protocol === 'ws'
          ? await wsChainId(endpoint.url, this.timeoutMs)
          : await rpcChainId(endpoint.url, this.timeoutMs);
      const blockNumber =
        endpoint.protocol === 'ws'
          ? await wsBlockNumber(endpoint.url, this.timeoutMs)
          : await rpcBlockNumber(endpoint.url, this.timeoutMs);
      if (chainId !== endpoint.chainId) throw new Error('chainId_mismatch');
      if (!Number.isFinite(blockNumber)) throw new Error('blockNumber_invalid');
      this.recordSuccess(endpoint, Date.now() - started);
    } catch (err) {
      this.recordFailure(endpoint, err instanceof Error ? err.message : 'probe_failed');
    }
  }

  private async probeAll() {
    const list = Array.from(this.endpoints.values()).flat();
    for (const endpoint of list) {
      await this.probe(endpoint);
    }
  }

  private orderedEndpoints(chain: ChainRef) {
    const list = this.endpoints.get(chain) || [];
    const order = { OK: 0, DEGRADED: 1, DOWN: 2 } as const;
    return [...list].sort((a, b) => order[a.status] - order[b.status]);
  }

  getProvider(chain: ChainRef | ChainLayer) {
    const normalized = normalizeLayer(chain);
    const endpoints = this.orderedEndpoints(normalized).filter((e) => e.protocol === 'http');
    const target = endpoints[0];
    if (!target) {
      throw new Error('rpc_unavailable');
    }
    return new JsonRpcProvider(target.url);
  }

  getHealth() {
    const data: Record<ChainLayer, Endpoint[]> = { L1: [], L2: [], L3: [] };
    for (const [key, value] of this.endpoints.entries()) {
      const layer = chainForLayer(key);
      data[layer] = value.map((endpoint) => ({
        ...endpoint,
        failures: [...endpoint.failures]
      }));
    }
    return data;
  }

  getPoolSnapshot() {
    return this.getHealth();
  }

  async withProvider<T>(chain: ChainRef | ChainLayer, action: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
    const normalized = normalizeLayer(chain);
    const endpoints = this.orderedEndpoints(normalized).filter((e) => e.protocol === 'http');
    if (!endpoints.length) throw new Error('rpc_unavailable');
    const first = endpoints[0];
    try {
      const started = Date.now();
      const result = await action(new JsonRpcProvider(first.url));
      this.recordSuccess(first, Date.now() - started);
      return result;
    } catch (err) {
      this.recordFailure(first, err instanceof Error ? err.message : 'request_failed');
      const next = endpoints[1];
      if (!next) throw err;
      const started = Date.now();
      const result = await action(new JsonRpcProvider(next.url));
      this.recordSuccess(next, Date.now() - started);
      return result;
    }
  }
}

export const ghostWalletRpcManager = new GhostWalletRpcManager();
