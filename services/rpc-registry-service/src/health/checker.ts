import { readFile } from 'fs/promises';
import path from 'path';
import WebSocket from 'ws';

export type HealthStatus = 'healthy' | 'degraded' | 'down';

export type RegistryDoc = {
  registry: {
    name: string;
    version: string;
    generatedAt: string;
  };
  chains: RegistryChain[];
};

export type RegistryChain = {
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
  endpoints: RegistryEndpoint[];
  explorers: { name: string; url: string; standard: 'EIP3091' }[];
  metadata: {
    rpcStandard: 'ethereum';
    evmCompatible: true;
    consensus: string;
  };
};

export type RegistryEndpoint = {
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
    status: HealthStatus;
    latencyMs: number;
    lastChecked: string;
  };
};

type HealthSnapshot = {
  status: HealthStatus;
  latencyMs: number;
  lastChecked: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const defaultRegistryPath = () => path.join(__dirname, '..', 'data', 'registry.json');

export const loadRegistryFile = async (registryPath: string): Promise<RegistryDoc> => {
  const raw = await readFile(registryPath, 'utf8');
  return JSON.parse(raw) as RegistryDoc;
};

const rpcCall = async <T>(url: string, method: string, params: unknown[] = [], timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error('rpc_failed');
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message || 'rpc_error');
    return body.result as T;
  } finally {
    clearTimeout(timer);
  }
};

const checkHttp = async (url: string, timeoutMs: number, degradedMs: number): Promise<HealthSnapshot> => {
  const started = Date.now();
  try {
    await rpcCall<string>(url, 'eth_chainId', [], timeoutMs);
    const latencyMs = Date.now() - started;
    return {
      status: latencyMs > degradedMs ? 'degraded' : 'healthy',
      latencyMs,
      lastChecked: new Date().toISOString()
    };
  } catch {
    return {
      status: 'down',
      latencyMs: timeoutMs,
      lastChecked: new Date().toISOString()
    };
  }
};

const checkWs = async (url: string, timeoutMs: number, degradedMs: number): Promise<HealthSnapshot> => {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new WebSocket(url);
    let done = false;
    const finish = (status: HealthStatus) => {
      if (done) return;
      done = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      const latencyMs = Date.now() - started;
      resolve({
        status,
        latencyMs: status === 'down' ? timeoutMs : latencyMs,
        lastChecked: new Date().toISOString()
      });
    };
    const timer = setTimeout(() => finish('down'), timeoutMs);
    socket.onopen = () => {
      clearTimeout(timer);
      finish(Date.now() - started > degradedMs ? 'degraded' : 'healthy');
    };
    socket.onerror = () => {
      clearTimeout(timer);
      finish('down');
    };
  });
};

export class HealthChecker {
  private registryPath: string;
  private baseRegistry: RegistryDoc | null = null;
  private healthMap = new Map<string, HealthSnapshot>();
  private intervalMs: number;
  private timeoutMs: number;
  private degradedMs: number;

  constructor(options: { registryPath?: string; intervalMs?: number; timeoutMs?: number; degradedMs?: number }) {
    this.registryPath = options.registryPath || defaultRegistryPath();
    this.intervalMs = options.intervalMs ?? 60_000;
    this.timeoutMs = options.timeoutMs ?? 1500;
    this.degradedMs = options.degradedMs ?? 1200;
  }

  async loadRegistry() {
    this.baseRegistry = await loadRegistryFile(this.registryPath);
    return this.baseRegistry;
  }

  getRegistrySnapshot(): RegistryDoc {
    if (!this.baseRegistry) {
      throw new Error('registry_not_loaded');
    }
    const cloned: RegistryDoc = JSON.parse(JSON.stringify(this.baseRegistry));
    cloned.registry.generatedAt = new Date().toISOString();
    cloned.chains.forEach((chain) => {
      chain.endpoints.forEach((endpoint) => {
        const key = `${chain.chainId}:${endpoint.url}`;
        const health = this.healthMap.get(key) || endpoint.health;
        endpoint.health = health;
      });
    });
    return cloned;
  }

  async runOnce() {
    if (!this.baseRegistry) await this.loadRegistry();
    if (!this.baseRegistry) return;
    const endpoints = this.baseRegistry.chains.flatMap((chain) =>
      chain.endpoints.map((endpoint) => ({ chainId: chain.chainId, endpoint }))
    );
    for (const { chainId, endpoint } of endpoints) {
      const key = `${chainId}:${endpoint.url}`;
      const result = endpoint.protocol === 'ws'
        ? await checkWs(endpoint.url, this.timeoutMs, this.degradedMs)
        : await checkHttp(endpoint.url, this.timeoutMs, this.degradedMs);
      this.healthMap.set(key, result);
      await sleep(50);
    }
  }

  start() {
    void this.runOnce();
    setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
  }
}
