/**
 * GhostExplorerClient — REST client for the GhostChain block explorer.
 *
 * Compatible with Blockscout v6 API (which can also serve as a GhostScan backend).
 * All endpoints are unauthenticated unless the explorer requires an API key.
 */

export interface ExplorerConfig {
  /** Explorer base URL, e.g. https://explorer.ghostchain.cloud */
  baseUrl: string;
  /** Optional API key */
  apiKey?: string;
  /** Timeout in ms (default: 20_000) */
  timeoutMs?: number;
}

// ── Response types ────────────────────────────────────────────────────────

export interface ExplorerTransaction {
  hash: `0x${string}`;
  blockNumber: number;
  blockHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: string;
  gas: number;
  gasPrice: string;
  gasUsed?: number;
  nonce: number;
  input: `0x${string}`;
  status?: "ok" | "error" | null;
  timestamp?: string;
}

export interface ExplorerTokenBalance {
  token: {
    address: `0x${string}`;
    name: string;
    symbol: string;
    decimals: number;
    type: "ERC-20" | "ERC-721" | "ERC-1155";
  };
  value: string;
}

export interface ExplorerNFT {
  id: string;
  contractAddress: `0x${string}`;
  tokenType: "ERC-721" | "ERC-1155";
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ExplorerContractInfo {
  address: `0x${string}`;
  name?: string;
  compilerVersion?: string;
  isVerified: boolean;
  abi?: unknown[];
  sourceCode?: string;
  constructorArgs?: string;
}

export interface ExplorerBlock {
  height: number;
  hash: `0x${string}`;
  timestamp: string;
  transactionCount: number;
  miner?: `0x${string}`;
  gasUsed: string;
  gasLimit: string;
  size: number;
}

export interface ExplorerLog {
  address: `0x${string}`;
  topics: `0x${string}`[];
  data: `0x${string}`;
  blockNumber: number;
  transactionHash: `0x${string}`;
  logIndex: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextPageParams?: Record<string, string>;
}

export class GhostExplorerClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config: ExplorerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransaction(hash: `0x${string}`): Promise<ExplorerTransaction> {
    return this._get(`/api/v2/transactions/${hash}`);
  }

  async getAddressTransactions(
    address: `0x${string}`,
    opts: { page?: number; limit?: number; filter?: "to" | "from" } = {},
  ): Promise<PaginatedResult<ExplorerTransaction>> {
    const params: Record<string, string> = {};
    if (opts.page) params.page = String(opts.page);
    if (opts.limit) params.limit = String(opts.limit);
    if (opts.filter) params.filter = opts.filter;
    return this._get(`/api/v2/addresses/${address}/transactions`, params);
  }

  async getInternalTransactions(
    hash: `0x${string}`,
  ): Promise<PaginatedResult<ExplorerTransaction>> {
    return this._get(`/api/v2/transactions/${hash}/internal-transactions`);
  }

  // ── Tokens ────────────────────────────────────────────────────────────────

  async getTokenBalances(
    address: `0x${string}`,
  ): Promise<ExplorerTokenBalance[]> {
    return this._get(`/api/v2/addresses/${address}/token-balances`);
  }

  async getNFTs(
    address: `0x${string}`,
    opts: { tokenType?: "ERC-721" | "ERC-1155" } = {},
  ): Promise<PaginatedResult<ExplorerNFT>> {
    const params: Record<string, string> = {};
    if (opts.tokenType) params.type = opts.tokenType;
    return this._get(`/api/v2/addresses/${address}/nft`, params);
  }

  // ── Contracts ─────────────────────────────────────────────────────────────

  async getContractInfo(
    address: `0x${string}`,
  ): Promise<ExplorerContractInfo> {
    const raw = await this._get<{
      address: `0x${string}`;
      name?: string;
      compiler_version?: string;
      is_verified?: boolean;
      abi?: unknown[];
      source_code?: string;
      constructor_args?: string;
    }>(`/api/v2/smart-contracts/${address}`);

    return {
      address: raw.address,
      name: raw.name,
      compilerVersion: raw.compiler_version,
      isVerified: raw.is_verified ?? false,
      abi: raw.abi,
      sourceCode: raw.source_code,
      constructorArgs: raw.constructor_args,
    };
  }

  async getContractAbi(address: `0x${string}`): Promise<unknown[]> {
    const info = await this.getContractInfo(address);
    return info.abi ?? [];
  }

  // ── Blocks ────────────────────────────────────────────────────────────────

  async getBlock(
    blockNumberOrHash: number | `0x${string}`,
  ): Promise<ExplorerBlock> {
    return this._get(`/api/v2/blocks/${blockNumberOrHash}`);
  }

  async getLatestBlocks(
    limit = 10,
  ): Promise<PaginatedResult<ExplorerBlock>> {
    return this._get(`/api/v2/blocks`, { limit: String(limit) });
  }

  // ── Logs ─────────────────────────────────────────────────────────────────

  async getLogs(
    address: `0x${string}`,
    opts: { fromBlock?: number; toBlock?: number } = {},
  ): Promise<PaginatedResult<ExplorerLog>> {
    const params: Record<string, string> = {};
    if (opts.fromBlock !== undefined) params.from_block = String(opts.fromBlock);
    if (opts.toBlock !== undefined) params.to_block = String(opts.toBlock);
    return this._get(`/api/v2/addresses/${address}/logs`, params);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(): Promise<{
    totalBlocks: number;
    totalTransactions: string;
    totalAddresses: string;
    averageBlockTime: number;
    marketCap?: string;
  }> {
    const raw = await this._get<Record<string, unknown>>("/api/v2/stats");
    return {
      totalBlocks: Number(raw.total_blocks ?? 0),
      totalTransactions: String(raw.total_transactions ?? "0"),
      totalAddresses: String(raw.total_addresses ?? "0"),
      averageBlockTime: Number(raw.average_block_time ?? 0),
      marketCap: raw.market_cap as string | undefined,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _get<T = unknown>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    if (this.apiKey) params.apikey = this.apiKey;

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(
          `GhostExplorer HTTP ${res.status} for ${path}: ${await res.text()}`,
        );
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
