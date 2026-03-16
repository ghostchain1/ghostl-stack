/**
 * GhostNetworks — canonical registry for all GhostStack networks.
 * Single source of truth for chain IDs, RPC endpoints, and layer routing.
 */

export const GhostNetworks = {
  L1: {
    name:    "ghostchain",
    chainId: 1337,
    rpc:     process.env.GHOST_L1_RPC ?? "http://ghostchain-l1:8545",
    symbol:  "GST",
    explorer:"https://explorer.ghostchain.cloud",
  },
  L2: {
    name:    "ghostl2",
    chainId: 1338,
    rpc:     process.env.GHOST_L2_RPC ?? "http://ghostl2:9545",
    symbol:  "GST",
    explorer:"https://explorer.ghostchain.cloud?layer=2",
  },
  L3: {
    name:    "ghostl3",
    chainId: 1339,
    rpc:     process.env.GHOST_L3_RPC ?? "http://ghostl3:10545",
    symbol:  "GST",
    explorer:"https://explorer.ghostchain.cloud?layer=3",
  },
  devnet: {
    name:    "ghostchain-devnet",
    chainId: 1340,
    rpc:     process.env.GHOST_DEVNET_RPC ?? "http://127.0.0.1:8545",
    symbol:  "GST",
    explorer:"http://localhost:4000",
  },
  testnet: {
    name:    "ghostchain-testnet",
    chainId: 1341,
    rpc:     process.env.GHOST_TESTNET_RPC ?? "http://localhost:8545",
    symbol:  "GST",
    explorer:"http://localhost:4000",
  },
} as const;

export type GhostNetworkKey = keyof typeof GhostNetworks;

/** Ghost token unit conversions (replaces ETH/Gwei/Wei naming). */
export const GhostUnits = {
  /** Smallest unit — 1 GST = 10^18 GhostUnits */
  GHOST_UNIT:  1n,
  /** GhostGas = 10^9 GhostUnits (replaces Gwei) */
  GHOST_GAS:   1_000_000_000n,
  /** 1 GST = 10^18 GhostUnits */
  GST:         1_000_000_000_000_000_000n,
} as const;

/** Branding replacement map — for documentation and tooling. */
export const GhostBrandMap = {
  "Ethereum":  "GhostChain",
  "ERC20":     "GRC20",
  "ERC721":    "GRC721",
  "ERC1155":   "GRC1155",
  "eth_":      "ghost_",
  "ethers.js": "GhostSDK",
  "Wei":       "GhostUnit",
  "Gwei":      "GhostGas",
  "web3":      "GhostSDK",
} as const;

/** Known contract addresses by network. */
export const GhostContracts: Record<GhostNetworkKey, Record<string, string>> = {
  L1:      { GST: "", Bridge: "", Governance: "", Treasury: "" },
  L2:      { GST: "", Bridge: "", GhostSwap: "" },
  L3:      { GST: "", Bridge: "" },
  devnet:  { GST: "0x0000000000000000000000000000000000000001" },
  testnet: { GST: "" },
};
