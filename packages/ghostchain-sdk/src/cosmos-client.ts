/**
 * @file cosmos-client.ts
 *
 * Thin, fetch-only Cosmos REST (LCD) + gRPC-Web client for GhostChain.
 *
 * Works in both Node 22 and browser environments.  No external dependencies
 * beyond the Fetch API — consistent with the existing ghostchain-sdk ethos.
 *
 * Covers:
 *   - Bank module: balances, supply
 *   - Auth module: account info
 *   - Staking: validators, delegations
 *   - IBC: channels, clients
 *   - x/ghost module: nullifier / key-image query
 *   - x/ghostgov module: proposals
 *   - x/gsttoken: gas-sponsor list
 *   - tx: broadcast signed transactions
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CosmosClientConfig {
  /** Cosmos LCD (REST) base URL, e.g. "http://localhost:1317" */
  restUrl: string;
  /** Chain ID, e.g. "ghostchain-1" */
  chainId: string;
}

export type GhostProposalStatus =
  | 'VOTING_PERIOD'
  | 'QUEUED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'FAILED';

export interface GhostProposal {
  id: string;
  proposer: string;
  title: string;
  description: string;
  constitutional: boolean;
  amendment: boolean;
  ai_risk_tier: string;
  ai_veto: boolean;
  status: GhostProposalStatus;
  tally: {
    for_power: string;
    against_power: string;
    abstain_power: string;
  };
  submit_time: string;
  voting_end_time: string;
  eta?: string;
}

export interface BankBalance {
  denom: string;
  amount: string;
}

export interface AccountInfo {
  address: string;
  account_number: string;
  sequence: string;
  pub_key: { '@type': string; key: string } | null;
}

export interface IBCChannel {
  channel_id: string;
  port_id: string;
  state: string;
  ordering: string;
  counterparty: { port_id: string; channel_id: string };
  connection_hops: string[];
  version: string;
}

export interface TxBroadcastResult {
  tx_hash: string;
  code: number;
  raw_log: string;
  height: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * CosmosClient is a thin wrapper around the Cosmos SDK LCD REST API
 * for GhostChain.  It uses the native Fetch API with no external deps.
 */
export class CosmosClient {
  private readonly rest: string;
  public readonly chainId: string;

  constructor({ restUrl, chainId }: CosmosClientConfig) {
    this.rest = restUrl.replace(/\/$/, '');
    this.chainId = chainId;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.rest}${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${path} → ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.rest}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Node / chain info ──────────────────────────────────────────────────────

  /** Returns the latest block height and time. */
  async getLatestBlock(): Promise<{ height: string; time: string }> {
    const data = await this.get<{ block: { header: { height: string; time: string } } }>(
      '/cosmos/base/tendermint/v1beta1/blocks/latest'
    );
    return data.block.header;
  }

  /** Returns the node's status (moniker, version, peers). */
  async getNodeInfo(): Promise<Record<string, unknown>> {
    return this.get('/cosmos/base/tendermint/v1beta1/node_info');
  }

  // ── Bank module ───────────────────────────────────────────────────────────

  /** Returns all coin balances for the given bech32 address. */
  async getBalances(address: string): Promise<BankBalance[]> {
    const data = await this.get<{ balances: BankBalance[] }>(
      `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`
    );
    return data.balances ?? [];
  }

  /** Returns the ugst balance for `address`. */
  async getGSTBalance(address: string): Promise<bigint> {
    const balances = await this.getBalances(address);
    const ugst = balances.find((b) => b.denom === 'ugst');
    return ugst ? BigInt(ugst.amount) : 0n;
  }

  /** Returns the total token supply on GhostChain. */
  async getTotalSupply(): Promise<BankBalance[]> {
    const data = await this.get<{ supply: BankBalance[] }>('/cosmos/bank/v1beta1/supply');
    return data.supply ?? [];
  }

  // ── Auth module ───────────────────────────────────────────────────────────

  /** Returns account information (sequence, pub_key) for the given address. */
  async getAccount(address: string): Promise<AccountInfo> {
    const data = await this.get<{ account: AccountInfo }>(
      `/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`
    );
    return data.account;
  }

  // ── Staking module ────────────────────────────────────────────────────────

  /** Returns all bonded validators. */
  async getValidators(): Promise<unknown[]> {
    const data = await this.get<{ validators: unknown[] }>(
      '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED'
    );
    return data.validators ?? [];
  }

  /** Returns a delegator's delegations. */
  async getDelegations(delegatorAddr: string): Promise<unknown[]> {
    const data = await this.get<{ delegation_responses: unknown[] }>(
      `/cosmos/staking/v1beta1/delegations/${encodeURIComponent(delegatorAddr)}`
    );
    return data.delegation_responses ?? [];
  }

  // ── IBC module ────────────────────────────────────────────────────────────

  /** Returns all IBC channels. */
  async getIBCChannels(): Promise<IBCChannel[]> {
    const data = await this.get<{ channels: IBCChannel[] }>(
      '/ibc/core/channel/v1/channels'
    );
    return data.channels ?? [];
  }

  /** Returns IBC channels by port. */
  async getIBCChannelsByPort(portId: string): Promise<IBCChannel[]> {
    const all = await this.getIBCChannels();
    return all.filter((ch) => ch.port_id === portId);
  }

  // ── x/ghost module ────────────────────────────────────────────────────────

  /** Queries whether a nullifier hash has been spent. */
  async isNullifierSpent(nullifierHex: string): Promise<boolean> {
    try {
      const data = await this.get<{ spent: boolean }>(
        `/ghostchain/ghost/v1/nullifier/${encodeURIComponent(nullifierHex)}/spent`
      );
      return data.spent;
    } catch {
      return false;
    }
  }

  /** Queries whether a ring-signature key image has been recorded. */
  async isKeyImageUsed(keyImageHex: string): Promise<boolean> {
    try {
      const data = await this.get<{ used: boolean }>(
        `/ghostchain/ghost/v1/keyimage/${encodeURIComponent(keyImageHex)}/used`
      );
      return data.used;
    } catch {
      return false;
    }
  }

  // ── x/ghostgov module ─────────────────────────────────────────────────────

  /** Returns all governance proposals. */
  async getProposals(): Promise<GhostProposal[]> {
    const data = await this.get<{ proposals: GhostProposal[] }>(
      '/ghostchain/ghostgov/v1/proposals'
    );
    return data.proposals ?? [];
  }

  /** Returns a single proposal by ID. */
  async getProposal(id: string | number): Promise<GhostProposal> {
    const data = await this.get<{ proposal: GhostProposal }>(
      `/ghostchain/ghostgov/v1/proposals/${id}`
    );
    return data.proposal;
  }

  /** Returns proposals matching the given status filter. */
  async getProposalsByStatus(status: GhostProposalStatus): Promise<GhostProposal[]> {
    const all = await this.getProposals();
    return all.filter((p) => p.status === status);
  }

  // ── x/gsttoken module ─────────────────────────────────────────────────────

  /** Returns the list of gas-sponsor addresses. */
  async getGasSponsorList(): Promise<string[]> {
    const data = await this.get<{ sponsors: string[] }>(
      '/ghostchain/gsttoken/v1/sponsors'
    );
    return data.sponsors ?? [];
  }

  /** Returns true if `address` is a whitelisted gas sponsor. */
  async isGasSponsor(address: string): Promise<boolean> {
    const sponsors = await this.getGasSponsorList();
    return sponsors.includes(address);
  }

  // ── Transaction broadcast ─────────────────────────────────────────────────

  /**
   * Broadcasts a signed transaction (in base64 bytes) to GhostChain.
   *
   * @param txBytes - The signed transaction serialised as a base64 string.
   * @param mode    - Broadcast mode: "BROADCAST_MODE_SYNC" (default) |
   *                  "BROADCAST_MODE_ASYNC" | "BROADCAST_MODE_BLOCK"
   */
  async broadcastTx(
    txBytes: string,
    mode: 'BROADCAST_MODE_SYNC' | 'BROADCAST_MODE_ASYNC' | 'BROADCAST_MODE_BLOCK' = 'BROADCAST_MODE_SYNC'
  ): Promise<TxBroadcastResult> {
    const data = await this.post<{ tx_response: TxBroadcastResult }>(
      '/cosmos/tx/v1beta1/txs',
      { tx_bytes: txBytes, mode }
    );
    return data.tx_response;
  }

  /**
   * Simulates a transaction to estimate gas.
   *
   * @param txBytes - The unsigned (or signed) transaction in base64.
   * @returns Estimated gas used.
   */
  async simulateTx(txBytes: string): Promise<string> {
    const data = await this.post<{ gas_info: { gas_used: string } }>(
      '/cosmos/tx/v1beta1/simulate',
      { tx_bytes: txBytes }
    );
    return data.gas_info.gas_used;
  }
}

// ─── Chain registry ───────────────────────────────────────────────────────────

/** Well-known GhostChain network configurations. */
export const GhostChainNetworks = {
  mainnet: {
    chainId: 'ghostchain-1',
    restUrl: process.env.GHOSTCHAIN_LCD_URL || 'https://api.ghostchain.cloud',
    rpcUrl: process.env.GHOSTCHAIN_RPC_URL || 'https://rpc.ghostchain.cloud',
    grpcUrl: process.env.GHOSTCHAIN_GRPC_URL || 'api.ghostchain.cloud:443',
  },
  testnet: {
    chainId: 'ghostchain-testnet-1',
    restUrl: process.env.GHOSTCHAIN_TESTNET_LCD_URL || 'http://localhost:1317',
    rpcUrl: process.env.GHOSTCHAIN_TESTNET_RPC_URL || 'http://localhost:26657',
    grpcUrl: process.env.GHOSTCHAIN_TESTNET_GRPC_URL || 'localhost:9090',
  },
  local: {
    chainId: 'ghostchain-1',
    restUrl: 'http://localhost:1317',
    rpcUrl: 'http://localhost:26657',
    grpcUrl: 'localhost:9090',
  },
} as const;

export type GhostNetwork = keyof typeof GhostChainNetworks;

/** Factory helper that creates a CosmosClient for a known network. */
export const createCosmosClient = (
  network: GhostNetwork | CosmosClientConfig
): CosmosClient => {
  if (typeof network === 'string') {
    const cfg = GhostChainNetworks[network];
    return new CosmosClient({ restUrl: cfg.restUrl, chainId: cfg.chainId });
  }
  return new CosmosClient(network);
};
