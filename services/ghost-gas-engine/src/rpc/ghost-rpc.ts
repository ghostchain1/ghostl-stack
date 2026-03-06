import { config } from '../config.js';

export type RpcNamespace = 'eth' | 'ghost';

export type TxRequest = {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  chainId?: string;
  type?: string;
};

type RpcOptions = {
  url: string;
  namespace?: RpcNamespace | 'auto';
  timeoutMs?: number;
};

export class GhostRpc {
  private url: string;
  private namespace: RpcNamespace;
  private timeoutMs: number;
  private traceMethod: string;

  constructor(options: RpcOptions) {
    this.url = options.url;
    this.namespace = options.namespace && options.namespace !== 'auto' ? options.namespace : 'ghost';
    this.timeoutMs = options.timeoutMs || config.REQUEST_TIMEOUT_MS;
    this.traceMethod = 'debug_traceTransaction';
  }

  async init(): Promise<void> {
    if (config.GHOST_RPC_NAMESPACE !== 'auto') {
      this.namespace = config.GHOST_RPC_NAMESPACE;
      this.traceMethod = this.namespace === 'ghost' ? 'ghost_debugTraceTransaction' : 'debug_traceTransaction';
      return;
    }

    try {
      const modules = await this.requestRaw('rpc_modules', []);
      if (modules?.ghost) {
        this.namespace = 'ghost';
        this.traceMethod = 'ghost_debugTraceTransaction';
        return;
      }
      if (modules?.eth) {
        this.namespace = 'eth';
        this.traceMethod = 'debug_traceTransaction';
        return;
      }
    } catch {
      // ignore
    }

    try {
      await this.requestRaw('ghost_chainId', []);
      this.namespace = 'ghost';
      this.traceMethod = 'ghost_debugTraceTransaction';
      return;
    } catch {
      this.namespace = 'eth';
      this.traceMethod = 'debug_traceTransaction';
    }
  }

  getNamespace(): RpcNamespace {
    return this.namespace;
  }

  private async requestRaw(method: string, params: unknown[]): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal: controller.signal
      });
      const payload = await res.json();
      if (payload.error) {
        const message = payload.error?.message || 'rpc_error';
        const error = new Error(message);
        (error as Error & { code?: number; data?: unknown }).code = payload.error.code;
        (error as Error & { data?: unknown }).data = payload.error.data;
        throw error;
      }
      return payload.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private method(name: string): string {
    return this.namespace === 'ghost' ? `ghost_${name}` : `eth_${name}`;
  }

  async estimateGas(tx: TxRequest): Promise<string> {
    return this.requestRaw(this.method('estimateGas'), [tx]);
  }

  async call(tx: TxRequest): Promise<string> {
    return this.requestRaw(this.method('call'), [tx, 'latest']);
  }

  async sendRawTransaction(rawTx: string): Promise<string> {
    return this.requestRaw(this.method('sendRawTransaction'), [rawTx]);
  }

  async getTransactionReceipt(hash: string): Promise<any> {
    return this.requestRaw(this.method('getTransactionReceipt'), [hash]);
  }

  async getTransactionCount(address: string, tag: 'latest' | 'pending' = 'pending'): Promise<string> {
    return this.requestRaw(this.method('getTransactionCount'), [address, tag]);
  }

  async getBlockByNumber(tag: 'latest' | string = 'latest'): Promise<any> {
    return this.requestRaw(this.method('getBlockByNumber'), [tag, false]);
  }

  async getChainId(): Promise<string> {
    return this.requestRaw(this.method('chainId'), []);
  }

  async traceTransaction(hash: string): Promise<any | null> {
    try {
      return await this.requestRaw(this.traceMethod, [hash, {}]);
    } catch {
      return null;
    }
  }

  async getFeeData(): Promise<{ gasPrice?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }> {
    try {
      const history = await this.requestRaw(this.method('feeHistory'), ['0x1', 'latest', [10]]);
      const baseFee = history?.baseFeePerGas?.[0];
      const reward = history?.reward?.[0]?.[0];
      if (baseFee) {
        const base = BigInt(baseFee);
        const priority = reward ? BigInt(reward) : BigInt(0);
        return {
          maxPriorityFeePerGas: priority,
          maxFeePerGas: base * BigInt(2) + priority
        };
      }
    } catch {
      // ignore
    }

    const gasPriceHex = await this.requestRaw(this.method('gasPrice'), []);
    return { gasPrice: BigInt(gasPriceHex) };
  }
}

export const createGhostRpc = async (url: string): Promise<GhostRpc> => {
  const rpc = new GhostRpc({ url, namespace: config.GHOST_RPC_NAMESPACE, timeoutMs: config.REQUEST_TIMEOUT_MS });
  await rpc.init();
  return rpc;
};
