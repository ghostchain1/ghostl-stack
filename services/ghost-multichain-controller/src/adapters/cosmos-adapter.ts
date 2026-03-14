/**
 * Cosmos External Chain Adapter — Read-Only Observer
 *
 * Queries the Cosmos REST/LCD endpoint to observe block height and node status.
 * Uses the Cosmos SDK REST API (not JSON-RPC; different format from EVM chains).
 *
 * Config (env vars):
 *   COSMOS_EXTERNAL_LCD_URL — external Cosmos LCD URL (e.g. https://cosmos.example.com:1317)
 *                             Separate from the internal GhostChain Cosmos LCD at port 1317.
 */
import type { ChainSnapshot } from "../types.js";

// Internal GhostChain Cosmos LCD is at port 1317 — use COSMOS_EXTERNAL_LCD_URL
// for the *external* Cosmos chain (separate from GhostChain's own Cosmos layer).
const LCD_URL    = process.env["COSMOS_EXTERNAL_LCD_URL"] ?? "";
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

interface CosmosBlockResponse {
  block?: {
    header?: {
      height?: string;
    };
  };
}

interface CosmosNodeStatusResponse {
  default_node_info?: {
    network?: string;
  };
  sync_info?: {
    catching_up?: boolean;
    latest_block_height?: string;
  };
}

async function lcdGet<T>(path: string): Promise<T> {
  const res  = await fetch(`${LCD_URL}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`cosmos LCD ${path}: HTTP ${res.status}`);
  return await res.json() as T;
}

export async function getCosmosSnapshot(): Promise<ChainSnapshot> {
  const t0 = Date.now();
  try {
    validateHttpUrl(LCD_URL, "COSMOS_EXTERNAL_LCD_URL");

    const [blockRes, statusRes] = await Promise.all([
      lcdGet<CosmosBlockResponse>("/cosmos/base/tendermint/v1beta1/blocks/latest"),
      lcdGet<CosmosNodeStatusResponse>("/cosmos/base/node/v1beta1/status"),
    ]);

    const latencyMs   = Date.now() - t0;
    const blockHeight = blockRes.block?.header?.height ?? "0";
    const catchingUp  = statusRes.sync_info?.catching_up ?? false;
    const healthy     = !catchingUp && blockHeight !== "0";

    return { chainId: "cosmos", blockHeight, healthy, latencyMs, timestamp: Date.now() };
  } catch (err) {
    return {
      chainId: "cosmos", blockHeight: "0", healthy: false,
      latencyMs: Date.now() - t0, timestamp: Date.now(), error: String(err),
    };
  }
}
