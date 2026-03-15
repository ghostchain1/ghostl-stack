/// GhostChain L3 chain ID — ONLY layer allowed for LitVybzLive transactions.
/// Never use L1 (14000101) or L2 (901) for app-level microtransactions.
const int kGhostL3ChainId = 903;
const String kGhostL3RpcUrl = String.fromEnvironment(
  'GHOST_L3_RPC',
  defaultValue: 'http://localhost:39545',
);

/// LitVybzLive API base URL.
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:7001',
);

/// WebSocket URL for real-time events.
const String kSocketUrl = String.fromEnvironment(
  'SOCKET_URL',
  defaultValue: 'http://localhost:7001',
);

/// GhostBrain AI service (LitVybzLive local AI on 7002; global GhostBrain on 7900).
const String kGhostBrainUrl = String.fromEnvironment(
  'GHOSTBRAIN_URL',
  defaultValue: 'http://localhost:7002',
);

/// MediaSoup SFU signalling URL.
const String kMediasoupUrl = String.fromEnvironment(
  'MEDIASOUP_URL',
  defaultValue: 'http://localhost:2000',
);

/// GST token decimals (18).
const int kGstDecimals = 18;

/// GST canonical symbol — never use ETH/WETH.
const String kGstSymbol = 'GST';

/// PK battle duration (seconds).
const int kPkBattleDuration = 120;

/// Settlement batch interval (ms).
const int kSettlementIntervalMs = 5000;
