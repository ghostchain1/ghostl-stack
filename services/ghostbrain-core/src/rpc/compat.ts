import { request } from "undici";

const DEFAULT_TIMEOUT_MS = 4_000;

interface JsonRpcResponse {
  result?: string;
  error?: {
    code?: number;
    message?: string;
  };
}

function parseHexInteger(raw: string): number {
  const value = parseInt(raw, 16);
  return Number.isFinite(value) ? value : 0;
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const candidate = value?.trim();
    if (candidate) return candidate;
  }
  return undefined;
}

export function resolveRpcEndpoint(
  directEnvKeys: string[],
  listEnvKeys: string[],
  fallback: string,
): string {
  const direct = firstNonEmpty(directEnvKeys.map((key) => process.env[key]));
  if (direct) return direct;

  for (const key of listEnvKeys) {
    const raw = process.env[key];
    if (!raw) continue;
    const candidate = firstNonEmpty(raw.split(",").map((part) => part.trim()));
    if (candidate) return candidate;
  }

  return fallback;
}

export async function rpcHexCall(
  rpc: string,
  methods: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ method: string; result: string }> {
  let lastError: Error | null = null;

  for (const method of methods) {
    try {
      const res = await request(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method,
          params: [],
          id: 1,
        }),
        bodyTimeout: timeoutMs,
        headersTimeout: timeoutMs,
      });

      if (res.statusCode !== 200) {
        lastError = new Error(`HTTP ${res.statusCode} for ${method}`);
        continue;
      }

      const body = await res.body.json() as JsonRpcResponse;
      if (typeof body.result === "string" && body.result.startsWith("0x")) {
        return { method, result: body.result };
      }

      if (body.error?.message) {
        lastError = new Error(`${method}: ${body.error.message}`);
      } else {
        lastError = new Error(`${method}: invalid RPC payload`);
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`RPC probe failed for ${rpc}`);
}

export async function rpcBlockNumber(
  rpc: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ method: string; blockNumber: number; raw: string }> {
  const probe = await rpcHexCall(rpc, ["ghost_blockNumber", "eth_blockNumber"], timeoutMs);
  return {
    method: probe.method,
    raw: probe.result,
    blockNumber: parseHexInteger(probe.result),
  };
}

export async function rpcGasPrice(
  rpc: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ method: string; gasPrice: bigint; raw: string }> {
  const probe = await rpcHexCall(rpc, ["ghost_gasPrice", "eth_gasPrice"], timeoutMs);
  return {
    method: probe.method,
    raw: probe.result,
    gasPrice: BigInt(probe.result),
  };
}

export async function rpcAlive(
  rpc: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ alive: boolean; method?: string; blockNumber?: number; raw?: string; error?: string }> {
  try {
    const probe = await rpcBlockNumber(rpc, timeoutMs);
    return {
      alive: true,
      method: probe.method,
      blockNumber: probe.blockNumber,
      raw: probe.raw,
    };
  } catch (err: unknown) {
    return {
      alive: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
