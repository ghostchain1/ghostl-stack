/**
 * Solana External Chain Adapter — Read-Only Observer
 *
 * Queries the Solana JSON-RPC endpoint to observe slot height and node health.
 * Solana RPC uses different method names than EVM chains.
 *
 * Config (env vars):
 *   SOLANA_RPC_URL — full Solana RPC URL (required for live data)
 */
import type { ChainSnapshot } from "../types.js";

const RPC_URL    = process.env["SOLANA_RPC_URL"] ?? "";
const TIMEOUT_MS = 5_000;

function validateHttpUrl(url: string, label: string): void {
  if (!url) throw new Error(`${label} is not configured (set ${label} env var)`);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`${label} must be http:// or https://`);
    }
  } catch (err) {
    throw new Error(`Invalid ${label}: ${String(err)}`);
  }
}

interface SolanaRpcResponse<T> {
  jsonrpc: "2.0";
  id:      number;
  result?: T;
  error?:  { code: number; message: string };
}

async function solanaRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res  = await fetch(RPC_URL, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json() as SolanaRpcResponse<T>;
  if (data.error) throw new Error(`solana RPC error: ${data.error.message}`);
  if (data.result === undefined) throw new Error(`solana ${method}: empty result`);
  return data.result;
}

export async function getSolanaSnapshot(): Promise<ChainSnapshot> {
  const t0 = Date.now();
  try {
    validateHttpUrl(RPC_URL, "SOLANA_RPC_URL");

    // getSlot returns the current slot height (analogous to block number)
    // getHealth returns "ok" string or throws on unhealthy node
    const [slot, health] = await Promise.all([
      solanaRpc<number>("getSlot", [{ commitment: "finalized" }]),
      solanaRpc<string>("getHealth"),
    ]);

    const latencyMs  = Date.now() - t0;
    const blockHeight = BigInt(slot).toString();
    const healthy     = health === "ok";

    return { chainId: "solana", blockHeight, healthy, latencyMs, timestamp: Date.now() };
  } catch (err) {
    return {
      chainId: "solana", blockHeight: "0", healthy: false,
      latencyMs: Date.now() - t0, timestamp: Date.now(), error: String(err),
    };
  }
}
