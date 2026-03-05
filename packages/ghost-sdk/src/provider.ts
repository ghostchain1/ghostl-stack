/**
 * ghostJsonRpcProvider
 *
 * Extends ghost v6 JsonRpcProvider with:
 *  - Layer awareness (L1 / L2 / L3)
 *  - gst_* method canonicalisation (falls back to eth_* when not supported)
 *  - GST balance helpers
 *  - Network info metadata
 *  - Automatic network config from GhostNetworks if no explicit network is passed
 */

import {
  JsonRpcProvider,
  Network,
} from "ethers";
import {
  GhostNetworks,
  networkByChainId,
  type GhostLayer,
  type GhostNetworkConfig,
} from "./networks.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function isMethodNotFound(err: unknown): boolean {
  const code = (err as { code?: number } | null)?.code;
  if (code === -32601) return true;
  const msg = String((err as { message?: string } | null)?.message ?? "")
    .toLowerCase();
  return (
    msg.includes("method not found") ||
    msg.includes("does not exist") ||
    msg.includes("not available")
  );
}

// ─── provider ───────────────────────────────────────────────────────────────

export class ghostJsonRpcProvider extends JsonRpcProvider {
  /** Which layer of the GhostStack this provider is connected to. */
  readonly layer: GhostLayer;

  /**
   * @param url     JSON-RPC endpoint URL.  Defaults to the local dev RPC for
   *                the given layer (from GhostNetworks / env vars).
   * @param layer   "L1" | "L2" | "L3".  Defaults to "L1".
   * @param network Optional ghost Network override.  When omitted the
   *                provider fetches the chain ID from the node on first use.
   */
  constructor(
    url?: string,
    layer: GhostLayer = "L1",
    network?: Network | { name: string; chainId: number }
  ) {
    const cfg = GhostNetworks[layer];
    const rpc = url ?? cfg.rpc;

    // Build an ghost Network when the caller didn't supply one.
    const net =
      network instanceof Network
        ? network
        : new Network(
            network?.name ?? cfg.name,
            network?.chainId ?? cfg.chainId
          );

    super(rpc, net, { staticNetwork: net });
    this.layer = layer;
  }

  // ── GhostChain-specific metadata ──────────────────────────────────────────

  /** Returns the GhostStack layer ("L1" | "L2" | "L3"). */
  getLayer(): GhostLayer {
    return this.layer;
  }

  /** Returns the native gas token symbol ("GST"). */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getGasToken(): Promise<"GST"> {
    return "GST";
  }

  /**
   * Returns high-level network metadata for this provider.
   * Also resolves the live chain ID from the node to confirm connectivity.
   */
  async getGhostNetworkInfo(): Promise<GhostNetworkConfig & { liveChainId: number }> {
    const net = await super.getNetwork();
    const liveChainId = Number(net.chainId);
    const knownConfig = networkByChainId(liveChainId) ?? GhostNetworks[this.layer];
    return { ...knownConfig, layer: this.layer, liveChainId };
  }

  // ── Canonical gst_* / eth_* method routing ────────────────────────────────

  /**
   * Calls a gst_* method first; if the node returns method-not-found it
   * transparently retries with the equivalent eth_* method.
   *
   * Example: gst_blockNumber → eth_blockNumber
   */
  async sendGstMethod<T = unknown>(
    gstMethod: string,
    ethMethod: string,
    params: unknown[] = []
  ): Promise<T> {
    try {
      return await super.send(gstMethod, params) as T;
    } catch (err) {
      if (!isMethodNotFound(err)) throw err;
      return await super.send(ethMethod, params) as T;
    }
  }

  /** Canonical block number (tries gst_blockNumber, falls back to eth_blockNumber). */
  async getGhostBlockNumber(): Promise<number> {
    const hex = await this.sendGstMethod<string>(
      "gst_blockNumber",
      "eth_blockNumber"
    );
    return parseInt(hex, 16);
  }

  /** GST balance (wei) of address – alias for getBalance with GST branding. */
  async getGSTBalance(address: string): Promise<bigint> {
    return super.getBalance(address);
  }

  /** GST balance formatted in GST units (not wei). */
  async getGSTBalanceFormatted(address: string): Promise<string> {
    const wei = await this.getGSTBalance(address);
    // 18-decimal formatting without importing ghost formatUnits
    const whole = wei / 10n ** 18n;
    const frac = String(wei % 10n ** 18n).padStart(18, "0").replace(/0+$/, "") || "0";
    return `${whole}.${frac} GST`;
  }
}

// ─── factory helpers ─────────────────────────────────────────────────────────

/** Create a provider for GhostChain L1. */
export function createL1Provider(url?: string): ghostJsonRpcProvider {
  return new ghostJsonRpcProvider(url, "L1");
}

/** Create a provider for GhostL2. */
export function createL2Provider(url?: string): ghostJsonRpcProvider {
  return new ghostJsonRpcProvider(url, "L2");
}

/** Create a provider for GhostL3. */
export function createL3Provider(url?: string): ghostJsonRpcProvider {
  return new ghostJsonRpcProvider(url, "L3");
}

/**
 * Create one provider per layer, keyed by layer name.
 *
 * ```ts
 * const { L1, L2, L3 } = createAllLayerProviders();
 * ```
 */
export function createAllLayerProviders(urls?: {
  L1?: string;
  L2?: string;
  L3?: string;
}): Record<GhostLayer, ghostJsonRpcProvider> {
  return {
    L1: createL1Provider(urls?.L1),
    L2: createL2Provider(urls?.L2),
    L3: createL3Provider(urls?.L3),
  };
}
