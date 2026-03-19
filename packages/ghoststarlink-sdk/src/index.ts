/**
 * GhostStarlink SDK
 *
 * Satellite mesh network integration for GhostChain.
 * Enables GhostChain validator nodes and light clients to transmit
 * blocks, transactions, and consensus votes via satellite links —
 * providing off-grid, censorship-resistant connectivity.
 *
 * Key capabilities:
 *   - Satellite link management (Starlink terminal + fallback links)
 *   - Off-grid block propagation via satellite relay
 *   - Mesh peer routing (satellite ↔ ground node ↔ L1/L2/L3)
 *   - Link quality monitoring and automatic failover
 *   - GST micropayments for bandwidth (settled on GhostL3)
 *   - GhostChain node bootstrap over satellite
 *
 * Routing law: all traffic ultimately routes L3 → L2 → L1.
 * Satellite links are transport-level only — never bypass routing law.
 *
 * RPC: ghost_* only
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const GHOST_STARLINK_CHAINS = {
  /** Bandwidth micropayments and relay registry — L3 for low latency */
  payments: { chainId: 903,      rpc: 'http://localhost:7270', name: 'GhostL3' },
  /** Relay node registry and reputation — L2 */
  relay:    { chainId: 901,      rpc: 'http://localhost:7260', name: 'GhostL2' },
  /** Permanent satellite node registry — L1 */
  registry: { chainId: 14000101, rpc: 'http://localhost:18545', name: 'GhostChain L1' },
} as const;

export const GST_UNIT = 10n ** 18n;

/** Satellite link types */
export type LinkType = 'starlink' | 'iridium' | 'oneweb' | 'terrestrial' | 'lora' | 'ghost-mesh';

/** Link quality tiers */
export type LinkQuality = 'excellent' | 'good' | 'degraded' | 'poor' | 'offline';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Configuration for a GhostStarlink instance */
export interface GhostStarlinkConfig {
  /** L3 RPC for bandwidth payment settlement */
  paymentsRpc:  string;
  /** L2 RPC for relay registry */
  relayRpc:     string;
  /** L1 RPC for permanent registry */
  registryRpc?: string;
  /** On-chain relay registry contract (GhostL2) */
  relayRegistryAddress:    string;
  /** On-chain bandwidth payment contract (GhostL3) */
  bandwidthPaymentAddress: string;
  /** This node's wallet address */
  nodeAddress?: string;
  /** Optional JWT for authenticated relay operations */
  authToken?: string;
}

/** A satellite terminal registered on GhostChain */
export interface GhostSatTerminal {
  id:           string;
  operator:     string;    // GhostChain address
  linkType:     LinkType;
  latitude:     number;
  longitude:    number;
  altitude:     number;    // meters
  antennaId:    string;
  ipv6:         string | null;
  activeLinks:  number;
  bandwidthMbps: number;
  uptimePercent: number;
  status:       'online' | 'degraded' | 'offline';
  rateGSTPerMB: bigint;    // GST wei per megabyte relayed
  registeredAt: number;
  lastSeen:     number;
}

/** Link status for a satellite connection */
export interface GhostLinkStatus {
  terminalId:   string;
  linkType:     LinkType;
  quality:      LinkQuality;
  latencyMs:    number;
  jitterMs:     number;
  packetLoss:   number;    // 0.0 – 1.0
  throughputMbps: number;
  signalDb:     number;
  timestamp:    number;
}

/** A satellite relay node that forwards GhostChain traffic */
export interface GhostRelayNode {
  id:              string;
  operator:        string;
  terminalId:      string;
  ghostLayer:      'l1' | 'l2' | 'l3';
  p2pEndpoint:     string;
  rpcEndpoint:     string | null;
  reputationScore: number;  // 0–100
  totalRelayed:    bigint;  // bytes
  stakeGST:        bigint;  // GST staked for relay reputation
  slashCount:      number;
  status:          'active' | 'jailed' | 'inactive';
  registeredAt:    number;
}

/** Bandwidth usage record */
export interface GhostBandwidthUsage {
  sessionId:   string;
  terminalId:  string;
  payerAddress: string;
  bytesIn:     bigint;
  bytesOut:    bigint;
  totalGSTPaid: bigint;
  startTime:   number;
  endTime:     number | null;
}

/** A GhostChain block relayed over satellite */
export interface GhostSatBlock {
  layer:         'l1' | 'l2' | 'l3';
  blockHash:     string;
  blockHeight:   number;
  relayedBy:     string;   // relay node ID
  receivedAt:    number;   // satellite receipt timestamp
  broadcastAt:   number;   // ground broadcast timestamp
  latencyMs:     number;   // satellite leg latency
  sizeBytes:     number;
}

/** Mesh route for a packet: satellite → ground → node chain */
export interface GhostMeshRoute {
  source:      string;
  destination: string;
  hops:        Array<{ nodeId: string; linkType: LinkType; latencyMs: number }>;
  totalLatencyMs: number;
  reliability: number;  // 0.0–1.0
}

// ─── RPC Helper ───────────────────────────────────────────────────────────────

async function ghostRPC<T>(rpc: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GhostStarlink RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`GhostStarlink RPC: ${json.error.message}`);
  return json.result as T;
}

// ─── GhostStarlink Client ─────────────────────────────────────────────────────

export class GhostStarlink {
  private cfg: GhostStarlinkConfig;

  constructor(config: GhostStarlinkConfig) {
    this.cfg = config;
  }

  // ── Terminal Management ──────────────────────────────────────────────────────

  /**
   * Register a satellite terminal on GhostChain L1 (permanent registry).
   * Returns the signed transaction hash.
   */
  async registerTerminal(
    terminal: Omit<GhostSatTerminal, 'id' | 'activeLinks' | 'uptimePercent' | 'status' | 'registeredAt' | 'lastSeen'>,
    signedTx: string
  ): Promise<string> {
    return ghostRPC<string>(this.cfg.relayRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Get a terminal by ID.
   */
  async getTerminal(terminalId: string): Promise<GhostSatTerminal> {
    return ghostRPC<GhostSatTerminal>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('getTerminal(bytes32)', [terminalId]) },
      'latest',
    ]);
  }

  /**
   * List active terminals near a geographic location.
   */
  async getNearbyTerminals(lat: number, lon: number, radiusKm = 500): Promise<GhostSatTerminal[]> {
    return ghostRPC<GhostSatTerminal[]>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('getNearbyTerminals(int256,int256,uint256)', [Math.round(lat * 1e6), Math.round(lon * 1e6), radiusKm]) },
      'latest',
    ]);
  }

  /**
   * Report link status for a terminal (heartbeat from terminal operator).
   */
  async reportLinkStatus(terminalId: string, status: Omit<GhostLinkStatus, 'terminalId' | 'timestamp'>, signedTx: string): Promise<string> {
    return ghostRPC<string>(this.cfg.relayRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Get the current link quality for a terminal.
   */
  async getLinkStatus(terminalId: string): Promise<GhostLinkStatus> {
    return ghostRPC<GhostLinkStatus>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('getLinkStatus(bytes32)', [terminalId]) },
      'latest',
    ]);
  }

  // ── Relay Nodes ─────────────────────────────────────────────────────────────

  /**
   * Register a relay node (must own a terminal and stake GST).
   */
  async registerRelayNode(
    relay: Omit<GhostRelayNode, 'id' | 'reputationScore' | 'totalRelayed' | 'slashCount' | 'status' | 'registeredAt'>,
    signedTx: string
  ): Promise<string> {
    return ghostRPC<string>(this.cfg.relayRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * List active relay nodes for a GhostChain layer.
   */
  async getRelayNodes(layer: 'l1' | 'l2' | 'l3'): Promise<GhostRelayNode[]> {
    return ghostRPC<GhostRelayNode[]>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('getRelayNodes(uint8)', [layer === 'l1' ? 1 : layer === 'l2' ? 2 : 3]) },
      'latest',
    ]);
  }

  /**
   * Get a relay node by operator address.
   */
  async getRelayNodeOf(operator: string): Promise<GhostRelayNode | null> {
    try {
      return await ghostRPC<GhostRelayNode>(this.cfg.relayRpc, 'ghost_call', [
        { to: this.cfg.relayRegistryAddress, data: encodeCall('getRelayNodeOf(address)', [operator]) },
        'latest',
      ]);
    } catch { return null; }
  }

  // ── Bandwidth Payments ───────────────────────────────────────────────────────

  /**
   * Open a bandwidth payment session with a relay node.
   * Deposits GST into the bandwidth escrow contract on L3.
   * Returns session ID.
   */
  async openSession(terminalId: string, depositGST: bigint, signedTx: string): Promise<string> {
    const txHash = await ghostRPC<string>(this.cfg.paymentsRpc, 'ghost_sendRawTransaction', [signedTx]);
    return txHash;
  }

  /**
   * Close a bandwidth session and settle final payment.
   * Unused deposit is refunded to payer.
   */
  async closeSession(sessionId: string, signedTx: string): Promise<{ paidGST: bigint; refundedGST: bigint; txHash: string }> {
    const txHash = await ghostRPC<string>(this.cfg.paymentsRpc, 'ghost_sendRawTransaction', [signedTx]);
    const usage  = await this.getSessionUsage(sessionId);
    return {
      paidGST:     usage.totalGSTPaid,
      refundedGST: usage.bytesIn === 0n ? 0n : 0n, // computed on-chain
      txHash,
    };
  }

  /**
   * Get usage stats for an active/closed session.
   */
  async getSessionUsage(sessionId: string): Promise<GhostBandwidthUsage> {
    return ghostRPC<GhostBandwidthUsage>(this.cfg.paymentsRpc, 'ghost_call', [
      { to: this.cfg.bandwidthPaymentAddress, data: encodeCall('getSession(bytes32)', [sessionId]) },
      'latest',
    ]);
  }

  /**
   * Estimate GST cost for a given data transfer.
   */
  async estimateCost(terminalId: string, bytesToSend: bigint): Promise<{ estimatedGST: bigint; rateGSTPerMB: bigint }> {
    const terminal = await this.getTerminal(terminalId);
    const mb = bytesToSend / (1024n * 1024n) + 1n;
    return {
      estimatedGST: mb * terminal.rateGSTPerMB,
      rateGSTPerMB: terminal.rateGSTPerMB,
    };
  }

  // ── Block Relay ─────────────────────────────────────────────────────────────

  /**
   * Submit a GhostChain block received via satellite for ground broadcast.
   * This is called by relay node operators to propagate blocks to ground nodes.
   */
  async submitRelayedBlock(block: GhostSatBlock, signedTx: string): Promise<string> {
    const targetRpc = block.layer === 'l3' ? this.cfg.paymentsRpc
                    : block.layer === 'l2' ? this.cfg.relayRpc
                    : (this.cfg.registryRpc ?? this.cfg.relayRpc);
    return ghostRPC<string>(targetRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Get blocks recently relayed via satellite for a layer.
   */
  async getRelayedBlocks(layer: 'l1' | 'l2' | 'l3', limit = 20): Promise<GhostSatBlock[]> {
    return ghostRPC<GhostSatBlock[]>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('getRelayedBlocks(uint8,uint256)', [layer === 'l1' ? 1 : layer === 'l2' ? 2 : 3, limit]) },
      'latest',
    ]);
  }

  // ── Mesh Routing ────────────────────────────────────────────────────────────

  /**
   * Calculate the optimal mesh route from source to destination node.
   * Considers link quality, latency, and relay reputation scores.
   */
  async findRoute(sourceNodeId: string, destinationNodeId: string): Promise<GhostMeshRoute> {
    return ghostRPC<GhostMeshRoute>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('findRoute(bytes32,bytes32)', [sourceNodeId, destinationNodeId]) },
      'latest',
    ]);
  }

  /**
   * Announce a node's mesh presence (heartbeat — called regularly by node operators).
   */
  async announcePresence(nodeId: string, p2pEndpoint: string, linkType: LinkType, signedTx: string): Promise<string> {
    return ghostRPC<string>(this.cfg.relayRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  // ── Network Statistics ───────────────────────────────────────────────────────

  /**
   * Get global GhostStarlink network statistics.
   */
  async getNetworkStats(): Promise<{
    activeTerminals:  number;
    activeRelays:     number;
    totalBytesRelayed: bigint;
    avgLatencyMs:     number;
    coveragePercent:  number;  // 0–100 global geographic coverage estimate
    nativeToken:      string;
  }> {
    const stats = await ghostRPC<{
      activeTerminals: number;
      activeRelays:    number;
      totalBytesRelayed: string;
      avgLatencyMs:    number;
      coveragePercent: number;
    }>(this.cfg.relayRpc, 'ghost_call', [
      { to: this.cfg.relayRegistryAddress, data: encodeCall('getNetworkStats()', []) },
      'latest',
    ]);
    return {
      ...stats,
      totalBytesRelayed: BigInt(stats.totalBytesRelayed),
      nativeToken: 'GST',
    };
  }

  // ── Slashing ─────────────────────────────────────────────────────────────────

  /**
   * Report a relay node for misconduct (dropped blocks, data manipulation).
   * Slashing requires governance quorum before execution.
   */
  async reportMisconduct(relayId: string, evidence: string, signedTx: string): Promise<string> {
    return ghostRPC<string>(this.cfg.relayRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────

  /**
   * Bootstrap a new GhostChain node over satellite.
   * Returns the list of relay nodes and genesis block RPC endpoints.
   */
  async bootstrapNode(layer: 'l1' | 'l2' | 'l3'): Promise<{
    relayNodes:     GhostRelayNode[];
    genesisHash:    string;
    chainId:        number;
    rpcEndpoints:   string[];
    p2pBootstrappers: string[];
  }> {
    const relayNodes = await this.getRelayNodes(layer);
    const chainIds   = { l1: 14000101, l2: 901, l3: 903 };

    return {
      relayNodes,
      genesisHash:  '0x' + '0'.repeat(64), // fetched from registry in production
      chainId:      chainIds[layer],
      rpcEndpoints: relayNodes.filter(r => r.rpcEndpoint).map(r => r.rpcEndpoint!),
      p2pBootstrappers: relayNodes.map(r => r.p2pEndpoint),
    };
  }

  // ── GST Balance ──────────────────────────────────────────────────────────────

  /**
   * GST balance on L3 (for bandwidth payment sessions).
   */
  async getGSTBalance(address: string): Promise<bigint> {
    const hex = await ghostRPC<string>(this.cfg.paymentsRpc, 'ghost_getBalance', [address, 'latest']);
    return BigInt(hex ?? '0x0');
  }

  // ── Static Factories ─────────────────────────────────────────────────────────

  /** GhostStarlink on devnet */
  static devnet(overrides?: Partial<GhostStarlinkConfig>): GhostStarlink {
    return new GhostStarlink({
      paymentsRpc:             'http://localhost:7270',
      relayRpc:                'http://localhost:7260',
      registryRpc:             'http://localhost:18545',
      relayRegistryAddress:    '0x0000000000000000000000000000000000020001',
      bandwidthPaymentAddress: '0x0000000000000000000000000000000000020002',
      ...overrides,
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  /** Format GST wei to human-readable string */
  static formatGST(wei: bigint, decimals = 6): string {
    const whole = wei / GST_UNIT;
    const frac  = wei % GST_UNIT;
    const fracStr = frac.toString().padStart(18, '0').slice(0, decimals);
    return `${whole}.${fracStr} GST`;
  }

  /** Bytes to megabytes (rounded up) */
  static bytesToMB(bytes: bigint): bigint {
    return bytes / (1024n * 1024n) + (bytes % (1024n * 1024n) > 0n ? 1n : 0n);
  }

  /** Format bytes to human-readable string */
  static formatBytes(bytes: bigint): string {
    if (bytes < 1024n) return `${bytes} B`;
    if (bytes < 1024n * 1024n) return `${(Number(bytes) / 1024).toFixed(1)} KB`;
    if (bytes < 1024n * 1024n * 1024n) return `${(Number(bytes) / (1024 * 1024)).toFixed(2)} MB`;
    return `${(Number(bytes) / (1024 * 1024 * 1024)).toFixed(3)} GB`;
  }

  /** Link quality from raw metrics */
  static assessLinkQuality(latencyMs: number, packetLoss: number, throughputMbps: number): LinkQuality {
    if (packetLoss > 0.15 || throughputMbps < 0.1 || latencyMs > 2000) return 'offline';
    if (packetLoss > 0.05 || throughputMbps < 1 || latencyMs > 800) return 'poor';
    if (packetLoss > 0.02 || throughputMbps < 5 || latencyMs > 300) return 'degraded';
    if (latencyMs < 60 && throughputMbps > 50 && packetLoss < 0.001) return 'excellent';
    return 'good';
  }
}

// ─── Internal ABI encoder (minimal, no ethers dependency) ────────────────────

function encodeCall(signature: string, args: unknown[]): string {
  const selector = fnSelector(signature);
  const encoded  = args.map(a => {
    if (typeof a === 'bigint') return a.toString(16).padStart(64, '0');
    if (typeof a === 'number') return Math.abs(a).toString(16).padStart(64, '0');
    if (typeof a === 'string' && a.startsWith('0x')) return a.slice(2).padStart(64, '0');
    if (typeof a === 'string') return Buffer.from(a).toString('hex').padStart(64, '0');
    return '0'.repeat(64);
  }).join('');
  return `0x${selector}${encoded}`;
}

function fnSelector(sig: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type {
  GhostStarlinkConfig,
  GhostSatTerminal,
  GhostLinkStatus,
  GhostRelayNode,
  GhostBandwidthUsage,
  GhostSatBlock,
  GhostMeshRoute,
  LinkType,
  LinkQuality,
};

// ─── Sub-module exports ───────────────────────────────────────────────────────

export { StarlinkAdapter }   from './satellite/StarlinkAdapter.js';
export type {
  SatelliteNode,
  ConnectionResult,
  TerminalHealth,
  AdapterConfig,
  LinkStatus,
} from './satellite/StarlinkAdapter.js';

export { MeshRouter }        from './mesh/MeshRouter.js';
export type {
  MeshNode,
  MeshHop,
  MeshRoute,
  RouterConfig,
} from './mesh/MeshRouter.js';

export { NodeRelay }         from './relay/NodeRelay.js';
export type {
  RelayLayer,
  RelayedBlock,
  RelayQueueItem,
  BatchResult,
  NodeRelayConfig,
} from './relay/NodeRelay.js';

export { LatencyOptimizer }  from './latency/LatencyOptimizer.js';
export type {
  LatencyStats,
  ConnectionScore,
  BlockWindow,
  OptimizerConfig,
} from './latency/LatencyOptimizer.js';

export { EdgeValidator }     from './validator/EdgeValidator.js';
export type {
  EdgeValidatorConfig,
  EdgeStatus,
  ProposedBlock,
  VoteResult,
} from './validator/EdgeValidator.js';
