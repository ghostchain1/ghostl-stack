import { GhostRpcTransport } from "./GhostRpcTransport";
import { GhostRpcError } from "../errors";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class GhostJsonRpc {
  private id = 1;
  private transport: GhostRpcTransport;

  constructor(url: string, options: { timeoutMs?: number } = {}) {
    this.transport = new GhostRpcTransport(url, options);
  }

  async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const payload = {
      jsonrpc: "2.0",
      id: this.id++,
      method,
      params
    };

    const res = (await this.transport.send(payload)) as JsonRpcResponse;

    if (res.error) {
      throw new GhostRpcError(res.error.code, res.error.message, res.error.data);
    }

    return res.result as T;
  }
}
