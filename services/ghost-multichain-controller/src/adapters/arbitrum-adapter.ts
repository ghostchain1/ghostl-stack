/**
 * Arbitrum External Chain Adapter — Read-Only Observer
 *
 * Queries the Arbitrum RPC endpoint to observe chain health, block height,
 * and gas prices. Used by the crosschain-analyzer to assess the L1↔Arbitrum
 * bridge landing zone.
 *
 * Config (env vars):
 *   ARBITRUM_RPC_URL            — full RPC endpoint URL (required for live data)
 *   ARBITRUM_EXPECTED_CHAIN_ID  — decimal chain ID to verify (default: "42161")
 */
import type { ChainSnapshot } from "../types.js";

const RPC_URL           = process.env["ARBITRUM_RPC_URL"] ?? "";
const EXPECTED_CHAIN_ID = process.env["ARBITRUM_EXPECTED_CHAIN_ID"] ?? "42161";
const TIMEOUT_MS        = 5_000;

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

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id:      number;
  result?: string;
  error?:  { code: number; message: string };
}

async function rpc(method: string, params: unknown[] = []): Promise<string> {
  const res  = await fetch(RPC_URL, {
    method:  "POST",
    headers: { "content-type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json() as JsonRpcResponse;
  if (data.error) throw new Error(`arbitrum RPC error: ${data.error.message}`);
  return data.result ?? "0x0";
}

export async function getArbitrumSnapshot(): Promise<ChainSnapshot> {
  const t0 = Date.now();
  try {
    validateHttpUrl(RPC_URL, "ARBITRUM_RPC_URL");

    const [blockHex, chainIdHex, gasPriceHex] = await Promise.all([
      rpc("eth_blockNumber"),
      rpc("eth_chainId"),
      rpc("eth_gasPrice"),
    ]);

    const latencyMs   = Date.now() - t0;
    const blockHeight = BigInt(blockHex).toString();
    const gasPriceWei = BigInt(gasPriceHex).toString();
    const remoteChain = BigInt(chainIdHex).toString(10);

    const healthy = remoteChain === EXPECTED_CHAIN_ID;
    if (!healthy) {
      console.warn(
        `[arbitrum-adapter] chain ID mismatch: expected ${EXPECTED_CHAIN_ID}, got ${remoteChain}`,
      );
    }

    return { chainId: "arbitrum", blockHeight, healthy, gasPriceWei, latencyMs, timestamp: Date.now() };
  } catch (err) {
    return {
      chainId: "arbitrum", blockHeight: "0", healthy: false,
      latencyMs: Date.now() - t0, timestamp: Date.now(), error: String(err),
    };
  }
}
