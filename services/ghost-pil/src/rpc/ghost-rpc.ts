import { config } from '../config';

export type RpcNamespace = 'eth' | 'ghost';

export type RpcResponse<T> = {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

export type GhostRpcConfig = {
  rpcUrl: string;
  chainId: number;
  chainKey: string;
  namespace?: RpcNamespace;
  timeoutMs?: number;
};

let requestId = 1;

export class GhostRpc {
  private rpcUrl: string;
  private namespace: RpcNamespace;
  private timeoutMs: number;

  constructor({ rpcUrl, namespace, timeoutMs }: GhostRpcConfig) {
    this.rpcUrl = rpcUrl;
    this.namespace = namespace || 'eth';
    this.timeoutMs = timeoutMs ?? 10_000;
  }

  getNamespace() {
    return this.namespace;
  }

  setNamespace(namespace: RpcNamespace) {
    this.namespace = namespace;
  }

  private method(base: string) {
    return `${this.namespace}_${base}`;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const payload = {
      jsonrpc: '2.0',
      id: requestId++,
      method,
      params
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      throw new Error(`rpc_http_${res.status}`);
    }

    const json = (await res.json()) as RpcResponse<T>;
    if (json.error) {
      throw new Error(json.error.message || 'rpc_error');
    }
    if (json.result === undefined) {
      throw new Error('rpc_empty_result');
    }
    return json.result;
  }

  async blockNumber(): Promise<string> {
    return this.call<string>(this.method('blockNumber'));
  }

  async getBlockByNumber(tag: string, fullTx = true): Promise<any> {
    return this.call(this.method('getBlockByNumber'), [tag, fullTx]);
  }

  async estimateGas(tx: Record<string, unknown>): Promise<string> {
    return this.call(this.method('estimateGas'), [tx]);
  }

  async callTx(tx: Record<string, unknown>): Promise<string> {
    return this.call(this.method('call'), [tx, 'latest']);
  }

  async sendRawTransaction(rawTx: string): Promise<string> {
    return this.call(this.method('sendRawTransaction'), [rawTx]);
  }

  async getTransactionReceipt(hash: string): Promise<any> {
    return this.call(this.method('getTransactionReceipt'), [hash]);
  }

  async traceTransaction(hash: string): Promise<any> {
    return this.call('debug_traceTransaction', [hash, {}]);
  }

  async getFeeData(): Promise<{ gasPrice?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string }> {
    try {
      const block = await this.call(this.method('getBlockByNumber'), ['latest', false]);
      if (block?.baseFeePerGas) {
        const maxPriorityFeePerGas = '0x3b9aca00';
        const maxFeePerGas = block.baseFeePerGas;
        return { maxFeePerGas, maxPriorityFeePerGas };
      }
    } catch {
      // ignore
    }
    const gasPrice = await this.call<string>(this.method('gasPrice'));
    return { gasPrice };
  }
}

const detectNamespace = async (rpcUrl: string): Promise<RpcNamespace> => {
  if (config.PIL_RPC_NAMESPACE) return config.PIL_RPC_NAMESPACE;
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method: 'rpc_modules', params: [] })
    });
    if (!res.ok) return 'eth';
    const json = (await res.json()) as RpcResponse<Record<string, unknown>>;
    const modules = json.result || {};
    if ('ghost' in modules) return 'ghost';
  } catch {
    return 'eth';
  }
  return 'eth';
};

export const createGhostRpc = async (cfg: GhostRpcConfig): Promise<GhostRpc> => {
  const namespace = cfg.namespace || (await detectNamespace(cfg.rpcUrl));
  return new GhostRpc({ ...cfg, namespace });
};
