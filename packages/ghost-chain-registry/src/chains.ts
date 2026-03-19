import type {
  ChainKey,
  GhostBrandingMetadata,
  GhostChainDescriptor,
  GhostEnvironment,
  GhostEnvironmentDescriptor,
} from "./types";

const GST = Object.freeze({
  name: "Ghost Settlement Token",
  symbol: "GST" as const,
  decimals: 18,
});

const BRANDING: GhostBrandingMetadata = Object.freeze({
  explorer: "GhostScan",
  wallet: "GhostWallet",
  dns: "GNS",
  dex: "GhostXchange",
  gasTokenSymbol: "GST",
});

function envValue(name: string): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  return process.env[name];
}

function envUrl(name: string, fallback: string): string {
  return envValue(name) || fallback;
}

function withEnvironment(
  name: GhostEnvironment,
  chains: Record<ChainKey, GhostChainDescriptor>,
): GhostEnvironmentDescriptor {
  return { name, chains };
}

export const CANONICAL_CHAIN_IDS = Object.freeze({
  ghostchain: 14000101,
  ghostl2: 901,
  ghostl3: 903,
});

export const CHAIN_KEYS = Object.freeze([
  "ghostchain",
  "ghostl2",
  "ghostl3",
] as const);

export const HOST_RPC_PORTS = Object.freeze({
  ghostchain: 18545,
  ghostl2: 29547,
  ghostl3: 39545,
});

export const CONTROL_RPC_PORTS = Object.freeze({
  ghostl2: 7260,
  ghostl3: 7270,
});

export const BASE_CHAINS: Record<ChainKey, GhostChainDescriptor> = Object.freeze({
  ghostchain: {
    key: "ghostchain",
    displayName: "GhostChain",
    layer: "L1",
    chainId: 14000101,
    parent: null,
    rpc: {
      publicHttp: envUrl("GHOSTCHAIN_PUBLIC_RPC_URL", "https://rpc.ghostchain.cloud"),
      localHttp: envUrl("GHOSTCHAIN_LOCAL_RPC_URL", "http://localhost:18545"),
      internalHttp: envUrl("GHOSTCHAIN_INTERNAL_RPC_URL", "http://ghostchain-l1:18545"),
      ws: envUrl("GHOSTCHAIN_WS_URL", "ws://localhost:18546"),
    },
    explorerUrl: envUrl("GHOSTCHAIN_EXPLORER_URL", "https://explorer.ghostchain.cloud"),
    nativeCurrency: GST,
    proofMode: "fraud",
    contracts: {
      settlementGateway: "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
      stateCommitmentChain: "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
      messageBus: envUrl("GHOSTCHAIN_MESSAGE_BUS_ADDRESS", "0x0000000000000000000000000000000000000000"),
      assetBridge: envUrl("GHOSTCHAIN_ASSET_BRIDGE_ADDRESS", "0x0000000000000000000000000000000000000000"),
      disputeRegistry: envUrl("GHOSTCHAIN_DISPUTE_REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000"),
      finalityOracle: "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422",
      registry: envUrl("GHOSTCHAIN_REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000"),
      rollup: "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
    },
    ports: {
      hostRpc: 18545,
      hostWs: 18546,
      controlRpc: 18545,
      sequencer: 0,
      deriver: 0,
      settlement: 0,
      bridge: 0,
      proof: 0,
    },
    branding: BRANDING,
    routingPolicy: "GhostChain handles external settlement and root finality",
    directL1Bypass: false,
  },
  ghostl2: {
    key: "ghostl2",
    displayName: "Ghost L2",
    layer: "L2",
    chainId: 901,
    parent: "ghostchain",
    rpc: {
      publicHttp: envUrl("GHOSTL2_PUBLIC_RPC_URL", "https://l2rpc.ghostchain.cloud"),
      localHttp: envUrl("GHOSTL2_LOCAL_RPC_URL", "http://localhost:29547"),
      internalHttp: envUrl("GHOSTL2_INTERNAL_RPC_URL", "http://ghost-exec-l2:7260"),
      ws: envUrl("GHOSTL2_WS_URL", "ws://localhost:29548"),
    },
    explorerUrl: envUrl("GHOSTL2_EXPLORER_URL", "https://explorer.ghostchain.cloud?layer=2"),
    nativeCurrency: GST,
    proofMode: "fraud",
    contracts: {
      settlementGateway: "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
      stateCommitmentChain: "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
      messageBus: envUrl("GHOSTL2_MESSAGE_BUS_ADDRESS", "0x0000000000000000000000000000000000000000"),
      assetBridge: envUrl("GHOSTL2_ASSET_BRIDGE_ADDRESS", "0x0000000000000000000000000000000000000000"),
      disputeRegistry: envUrl("GHOSTL2_DISPUTE_REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000"),
      finalityOracle: "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A",
      registry: envUrl("GHOSTL2_REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000"),
      rollup: "0xad32D5C2Da9f4159C4cc98686C005852b3905355",
    },
    ports: {
      hostRpc: 29547,
      hostWs: 29548,
      controlRpc: 7260,
      sequencer: 7261,
      deriver: 7262,
      settlement: 7263,
      bridge: 7264,
      proof: 7265,
      observability: 7276,
    },
    branding: BRANDING,
    routingPolicy: "L2 -> L1 only; receives L3 via L2 routing law",
    directL1Bypass: false,
  },
  ghostl3: {
    key: "ghostl3",
    displayName: "Ghost L3",
    layer: "L3",
    chainId: 903,
    parent: "ghostl2",
    rpc: {
      publicHttp: envUrl("GHOSTL3_PUBLIC_RPC_URL", "https://l3rpc.ghostchain.cloud"),
      localHttp: envUrl("GHOSTL3_LOCAL_RPC_URL", "http://localhost:39545"),
      internalHttp: envUrl("GHOSTL3_INTERNAL_RPC_URL", "http://ghost-exec-l3:7270"),
      ws: envUrl("GHOSTL3_WS_URL", "ws://localhost:39548"),
    },
    explorerUrl: envUrl("GHOSTL3_EXPLORER_URL", "https://explorer.ghostchain.cloud?layer=3"),
    nativeCurrency: GST,
    proofMode: "fraud",
    contracts: {
      settlementGateway: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90",
      stateCommitmentChain: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90",
      messageBus: envUrl("GHOSTL3_MESSAGE_BUS_ADDRESS", "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2"),
      assetBridge: envUrl("GHOSTL3_ASSET_BRIDGE_ADDRESS", "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2"),
      disputeRegistry: envUrl("GHOSTL3_DISPUTE_REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000"),
      finalityOracle: "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127",
      registry: envUrl("GHOSTL3_REGISTRY_ADDRESS", "0x0000000000000000000000000000000000000000"),
      rollup: "0x130A46b6E41DB6E1e18fb9c759F223c459190e90",
    },
    ports: {
      hostRpc: 39545,
      hostWs: 39548,
      controlRpc: 7270,
      sequencer: 7271,
      deriver: 7272,
      settlement: 7273,
      bridge: 7274,
      proof: 7275,
      observability: 7276,
    },
    branding: BRANDING,
    routingPolicy: "L3 -> L2 -> L1 only",
    directL1Bypass: false,
  },
});

export const GHOST_ENVIRONMENTS: Record<GhostEnvironment, GhostEnvironmentDescriptor> = Object.freeze({
  devnet: withEnvironment("devnet", BASE_CHAINS),
  testnet: withEnvironment("testnet", BASE_CHAINS),
  mainnet: withEnvironment("mainnet", BASE_CHAINS),
});
