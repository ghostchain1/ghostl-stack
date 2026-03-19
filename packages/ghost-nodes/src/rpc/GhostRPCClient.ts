/**
 * @file rpc/GhostRPCClient.ts
 * @module @ghostchain/ghost-nodes/rpc
 *
 * GhostRPCClient — low-level Ghost-branded JSON-RPC client.
 *
 * Public TypeScript API uses Ghost-branded method names (ghost_* / ghost_compat_*).
 * Wire transport translates to EVM JSON-RPC internally.
 * No eth_* names leak to any consumer of this client.
 */

import {
  GhostRPCCompatMethod,
  GhostRPCLegacyRollupMethod,
  type GhostRPCCompatMethodName,
} from "./GhostRPCMethod.js";

// ─── Internal wire map (NOT exported) ────────────────────────────────────────
// ghost_* → eth_* / optimism_* / net_* / debug_* wire names.
// This is the ONLY place in the codebase where eth_* strings are allowed outside compat.
const _WIRE_MAP: Readonly<Record<string, string>> = Object.freeze({
  ghost_blockNumber:                "eth_blockNumber",
  ghost_chainId:                    "eth_chainId",
  ghost_getBalance:                 "eth_getBalance",
  ghost_getTransactionCount:        "eth_getTransactionCount",
  ghost_getCode:                    "eth_getCode",
  ghost_getStorageAt:               "eth_getStorageAt",
  ghost_call:                       "eth_call",
  ghost_estimateGas:                "eth_estimateGas",
  ghost_gasPrice:                   "eth_gasPrice",
  ghost_feeHistory:                 "eth_feeHistory",
  ghost_sendRawTransaction:         "eth_sendRawTransaction",
  ghost_getBlockByNumber:           "eth_getBlockByNumber",
  ghost_getBlockByHash:             "eth_getBlockByHash",
  ghost_getTransactionByHash:       "eth_getTransactionByHash",
  ghost_getTransactionByBlockNumberAndIndex: "eth_getTransactionByBlockNumberAndIndex",
  ghost_getTransactionReceipt:      "eth_getTransactionReceipt",
  ghost_getLogs:                    "eth_getLogs",
  ghost_subscribe:                  "eth_subscribe",
  ghost_unsubscribe:                "eth_unsubscribe",
  ghost_newFilter:                  "eth_newFilter",
  ghost_newBlockFilter:             "eth_newBlockFilter",
  ghost_getFilterLogs:              "eth_getFilterLogs",
  ghost_getFilterChanges:           "eth_getFilterChanges",
  ghost_uninstallFilter:            "eth_uninstallFilter",
  ghost_maxPriorityFeePerGas:       "eth_maxPriorityFeePerGas",
  ghost_accounts:                   "eth_accounts",
  ghost_sign:                       "eth_sign",
  ghost_signTransaction:            "eth_signTransaction",
  ghost_protocolVersion:            "eth_protocolVersion",
  ghost_syncing:                    "eth_syncing",
  ghost_peerCount:                  "net_peerCount",
  ghost_listening:                  "net_listening",
  ghost_version:                    "net_version",
  ghost_clientVersion:              "web3_clientVersion",
  ghost_sha3:                       "web3_sha3",

  // Legacy rollup aliases are preserved internally for backward compatibility,
  // but they are intentionally isolated away from the package root export.
  [GhostRPCLegacyRollupMethod.getSyncStatus]:        "optimism_syncStatus",
  [GhostRPCLegacyRollupMethod.getOutputAtBlock]:     "optimism_outputAtBlock",
  [GhostRPCLegacyRollupMethod.getRollupConfig]:      "optimism_rollupConfig",
  [GhostRPCLegacyRollupMethod.getSafeHeadAtL1Block]: "optimism_safeHeadAtL1Block",

  // Explicit rollup-compat boundary for new code.
  [GhostRPCCompatMethod.getSyncStatus]:        "optimism_syncStatus",
  [GhostRPCCompatMethod.getOutputAtBlock]:     "optimism_outputAtBlock",
  [GhostRPCCompatMethod.getRollupConfig]:      "optimism_rollupConfig",
  [GhostRPCCompatMethod.getSafeHeadAtL1Block]: "optimism_safeHeadAtL1Block",

  ghost_getValidators:              "clique_getSigners",
  ghost_getSnapshot:                "clique_getSnapshot",
  ghost_traceTransaction:           "debug_traceTransaction",
  ghost_traceBlock:                 "debug_traceBlockByNumber",
  ghost_storageRangeAt:             "debug_storageRangeAt",
});

const _COMPAT_METHODS = new Set<string>(Object.values(GhostRPCCompatMethod));

// ─── Types ────────────────────────────────────────────────────────────────────

interface JSONRPCRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number;
}

interface JSONRPCResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

// ─── GhostRPCError ────────────────────────────────────────────────────────────

export class GhostRPCError extends Error {
  readonly code: number;
  readonly ghostMethod: string;
  readonly wireMethod: string;
  readonly data: unknown;

  constructor(opts: { code: number; message: string; ghostMethod: string; wireMethod: string; data?: unknown }) {
    super(`GhostRPC ${opts.ghostMethod}: [${opts.code}] ${opts.message}`);
    this.name      = "GhostRPCError";
    this.code      = opts.code;
    this.ghostMethod = opts.ghostMethod;
    this.wireMethod  = opts.wireMethod;
    this.data      = opts.data;
  }
}

// ─── GhostRPCClient ───────────────────────────────────────────────────────────

/**
 * Low-level GhostChain JSON-RPC client.
 *
 * Accepts Ghost-branded method identifiers (ghost_*) and translates them
 * to the EVM wire protocol internally. Supports primary + fallback URLs.
 */
export class GhostRPCClient {
  private readonly _primary: string;
  private readonly _fallbacks: readonly string[];
  private _id = 1;
  private _activeUrl: string;
  private _consecutiveFailures = 0;
  private readonly _maxConsecutiveFailures: number;

  constructor(
    primaryUrl: string,
    fallbackUrls: string[] = [],
    opts: { maxConsecutiveFailures?: number } = {}
  ) {
    this._primary   = primaryUrl;
    this._fallbacks = fallbackUrls;
    this._activeUrl = primaryUrl;
    this._maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 3;
  }

  // ─── Core call ─────────────────────────────────────────────────────────────

  /**
   * Make a Ghost-branded JSON-RPC call.
   *
   * @param ghostMethod  - Ghost-branded method name, e.g. "ghost_getBalance"
   * @param params       - JSON-RPC params array
   * @returns Parsed result (T)
   */
  async call<T = unknown>(ghostMethod: string, params: unknown[]): Promise<T> {
    const wireMethod = _WIRE_MAP[ghostMethod];
    if (!wireMethod) {
      throw new Error(`GhostRPCClient: unknown Ghost RPC method "${ghostMethod}"`);
    }

    const id  = this._id++;
    const req: JSONRPCRequest = { jsonrpc: "2.0", method: wireMethod, params, id };
    return this._callWithFailover<T>(req, ghostMethod);
  }

  /**
   * Make an explicit rollup-compat JSON-RPC call.
   *
   * Use this for legacy L2/L3 rollup telemetry that still depends on the
   * pre-custom-runtime RPC surface.
   */
  async callCompat<T = unknown>(ghostCompatMethod: GhostRPCCompatMethodName, params: unknown[]): Promise<T> {
    if (!_COMPAT_METHODS.has(ghostCompatMethod)) {
      throw new Error(`GhostRPCClient: unknown Ghost compat RPC method "${ghostCompatMethod}"`);
    }
    return this.call<T>(ghostCompatMethod, params);
  }

  /**
   * Ghost-branded batch call.
   * All ghost methods in the batch are resolved via the internal wire map.
   */
  async batchCall<T = unknown[]>(
    calls: Array<{ ghostMethod: string; params: unknown[] }>
  ): Promise<T[]> {
    const requests: JSONRPCRequest[] = calls.map(({ ghostMethod, params }) => {
      const wireMethod = _WIRE_MAP[ghostMethod];
      if (!wireMethod) throw new Error(`GhostRPCClient: unknown ghost method "${ghostMethod}"`);
      return { jsonrpc: "2.0" as const, method: wireMethod, params, id: this._id++ };
    });
    return this._batchRequest<T>(requests);
  }

  // ─── URL management ────────────────────────────────────────────────────────

  /** Returns the currently active RPC URL. */
  get activeUrl(): string { return this._activeUrl; }

  /** Resets the active URL to primary. */
  resetToPrimary(): void {
    this._activeUrl          = this._primary;
    this._consecutiveFailures = 0;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async _callWithFailover<T>(
    req: JSONRPCRequest,
    ghostMethod: string
  ): Promise<T> {
    const urls = [this._activeUrl, ...this._allUrls().filter((u) => u !== this._activeUrl)];

    let lastError: Error | undefined;
    for (const url of urls) {
      try {
        const result = await this._rawRequest<T>(url, req);
        if (url !== this._activeUrl) {
          this._activeUrl          = url;
          this._consecutiveFailures = 0;
        }
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof GhostRPCError) throw err; // RPC errors are final — don't retry
        this._consecutiveFailures++;
      }
    }
    throw lastError ?? new GhostRPCError({
      code: -32603,
      message: "All Ghost RPC endpoints unreachable",
      ghostMethod,
      wireMethod: req.method,
    });
  }

  private async _rawRequest<T>(url: string, req: JSONRPCRequest): Promise<T> {
    const resp = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(req),
    });
    if (!resp.ok) {
      throw new Error(`GhostRPC HTTP ${resp.status}: ${resp.statusText}`);
    }
    const json = (await resp.json()) as JSONRPCResponse<T>;
    if (json.error) {
      throw new GhostRPCError({
        code:        json.error.code,
        message:     json.error.message,
        ghostMethod: this._reverseWireToGhost(req.method),
        wireMethod:  req.method,
        data:        json.error.data,
      });
    }
    return json.result as T;
  }

  private async _batchRequest<T>(reqs: JSONRPCRequest[]): Promise<T[]> {
    const resp = await fetch(this._activeUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(reqs),
    });
    if (!resp.ok) throw new Error(`GhostRPC batch HTTP ${resp.status}: ${resp.statusText}`);
    const results = (await resp.json()) as JSONRPCResponse<T>[];
    return results.map((r, i) => {
      if (r.error) throw new GhostRPCError({
        code:        r.error.code,
        message:     r.error.message,
        ghostMethod: this._reverseWireToGhost(reqs[i].method),
        wireMethod:  reqs[i].method,
        data:        r.error.data,
      });
      return r.result as T;
    });
  }

  private _allUrls(): string[] {
    return [this._primary, ...this._fallbacks];
  }

  /** Reverse-lookup ghost method name from wire method (for error messages). */
  private _reverseWireToGhost(wireMethod: string): string {
    for (const [ghost, wire] of Object.entries(_WIRE_MAP)) {
      if (wire === wireMethod) return ghost;
    }
    return wireMethod;
  }
}
