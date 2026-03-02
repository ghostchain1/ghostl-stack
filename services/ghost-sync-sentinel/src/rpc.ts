import { request } from "undici";

export type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: unknown;
};

/**
 * Execute a JSON-RPC call with configurable timeout.
 * Throws on HTTP error, RPC-level error, or missing result.
 */
export async function jsonRpc<T>(
  url: string,
  method: string,
  params: unknown[] = [],
  timeoutMs = 4000
): Promise<T> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });

  const { body: resBody, statusCode } = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs
  });

  if (statusCode < 200 || statusCode >= 300) {
    // drain body to avoid socket leak
    await resBody.dump().catch(() => undefined);
    throw new Error(`RPC ${method} HTTP ${statusCode}`);
  }

  const data = (await resBody.json()) as JsonRpcResponse<T>;

  if (data.error) {
    throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
  }
  if (typeof data.result === "undefined") {
    throw new Error(`RPC ${method} missing result`);
  }

  return data.result;
}

/** Convert 0x-prefixed hex string to JS number. */
export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.startsWith("0x") ? hex.slice(2) : hex, 16);
}
