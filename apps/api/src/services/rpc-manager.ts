import { JsonRpcProvider } from 'ethers';
import WebSocket from 'ws';
import { env } from '../config/env';

type ChainRef = 'l1' | 'l2' | 'l3';
type EndpointStatus = 'OK' | 'DEGRADED' | 'DOWN';

type RegistryResponse = {
  chains: Array<{
    chainId: number;
    name: string;
    layer: 'L1' | 'L2' | 'L3';
    region: string;
    rpc: { http: string[]; ws: string[] };
    type: 'public' | 'private';
    status: 'active' | 'degraded';
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

const parseList = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const nowIso = () => new Date().toISOString();

const buildFallback = (): RegistryResponse => {
  const l1 = parseList(env.RPC_L1);
  const l1ws = parseList(process.env.RPC_L1_WS);
  const l2 = parseList(env.RPC_L2);
  const l2ws = parseList(process.env.RPC_L2_WS);
  const l3 = parseList(env.RPC_L3);
  const l3ws = parseList(process.env.RPC_L3_WS);
  const chains: RegistryResponse['chains'] = [];
  if (l1.length || l1ws.length) {
    chains.push({
      chainId: Number(process.env.RPC_L1_CHAIN_ID || process.env.GHOSTCHAIN_L1_CHAIN_ID || '14000101'),
      name: 'GhostChain',
      layer: 'L1',
      region: 'local',
      rpc: { http: l1, ws: l1ws },
      type: 'private',
      status: 'active'
    });
  }
  if (l2.length || l2ws.length) {
    chains.push({
      chainId: Number(process.env.RPC_L2_CHAIN_ID || process.env.GHOSTL2_CHAIN_ID || env.CHAIN_ID || '901'),
      name: 'GhostL2',
      layer: 'L2',
      region: 'local',
      rpc: { http: l2, ws: l2ws },
      type: 'private',
      status: 'active'
    });
  }
  if (l3.length || l3ws.length) {
    chains.push({
      chainId: Number(process.env.RPC_L3_CHAIN_ID || process.env.GHOSTL3_CHAIN_ID || '903'),
      name: 'GhostL3',
      layer: 'L3',
      region: 'local',
      rpc: { http: l3, ws: l3ws },
      type: 'private',
      status: 'active'
    });
  }
  return { chains };
};

const chainForLayer = (layer: ChainRef) => (layer === 'l1' ? 'L1' : layer === 'l2' ? 'L2' : 'L3');

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
      const endpoints: Endpoint[] = [
        ...entry.rpc.http.map((url) => ({
          chainId: entry.chainId,
          url,
          protocol: 'http' as const,
          status: 'DEGRADED',
          failures: [],
          recoveryCount: 0,
          lastCheckedAt: null,
          latencyMs: null,
          lastError: null
        })),
        ...entry.rpc.ws.map((url) => ({
          chainId: entry.chainId,
          url,
          protocol: 'ws' as const,
          status: 'DEGRADED',
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
      this.initEndpoints(buildFallback());
      return;
    }
    try {
      const res = await fetch(this.registryUrl);
      if (!res.ok) throw new Error('registry_unavailable');
      const body = (await res.json()) as RegistryResponse;
      if (!body.chains) throw new Error('invalid_registry');
      this.registryAvailable = true;
      this.initEndpoints(body);
    } catch {
      this.registryAvailable = false;
      this.initEndpoints(buildFallback());
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
      if (chainId !== endpoint.chainId) throw new Error('chainId_mismatch');
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

  getProvider(chain: ChainRef) {
    const endpoints = this.orderedEndpoints(chain).filter((e) => e.protocol === 'http');
    const target = endpoints[0];
    if (!target) {
      throw new Error('rpc_unavailable');
    }
    return new JsonRpcProvider(target.url);
  }

  async withProvider<T>(chain: ChainRef, action: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
    const endpoints = this.orderedEndpoints(chain).filter((e) => e.protocol === 'http');
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
