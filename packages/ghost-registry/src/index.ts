export {
  BASE_CHAINS as GhostNetworks,
  CANONICAL_CHAIN_IDS,
  CHAIN_KEYS,
  GHOST_ENVIRONMENTS,
  assertCanonicalChainId,
  getChain,
  getEnvironment,
} from "@ghostchain/ghost-chain-registry";

/** Ghost token unit conversions for GST-native naming. */
export const GhostUnits = {
  GHOST_UNIT: 1n,
  GHOST_GAS: 1_000_000_000n,
  GST: 1_000_000_000_000_000_000n,
} as const;

/** Branding replacement map — for documentation and tooling. */
export const GhostBrandMap = {
  LegacyEvmChain: "GhostChain",
  ERC20: "GRC20",
  ERC721: "GRC721",
  ERC1155: "GRC1155",
  "eth_": "ghost_",
  "legacy-sdk-js": "GhostSDK",
  Wei: "GhostUnit",
  Gwei: "GhostGas",
  web3: "GhostSDK",
} as const;
