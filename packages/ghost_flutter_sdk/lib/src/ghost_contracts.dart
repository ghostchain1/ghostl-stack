/// Canonical GhostChain contract addresses — governance-locked.
///
/// These addresses are fixed by governance and must not be changed without
/// a ratified on-chain proposal submitted via GhostChainGovernor.
///
/// All L3 contracts target GhostL3 (chain 903).
/// All L1 contracts target GhostChain L1 (chain 14000101).
abstract class GhostContracts {
  // ── Bridge ────────────────────────────────────────────────────────────────
  /// L2↔L3 bridge contract.
  static const String l2L3Bridge = '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2';

  /// L1 rollup anchor for L2.
  static const String l1Rollup = '0xad32D5C2Da9f4159C4cc98686C005852b3905355';

  /// L2 rollup anchor for L3.
  static const String l2Rollup = '0x130A46b6E41DB6E1e18fb9c759F223c459190e90';

  // ── Finality Oracles ──────────────────────────────────────────────────────
  static const String finalityOracleL1 =
      '0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422';
  static const String finalityOracleL2 =
      '0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A';
  static const String finalityOracleL3 =
      '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127';

  // ── LitVybzLive L3 contracts (chain 903) ──────────────────────────────────
  /// On-chain gift dispatch engine.
  static const String giftEngine =
      '0x0000000000000000000000000000000000000000'; // deploy pending

  /// NFT gift factory (Dragon, Crown, etc.).
  static const String nftGiftFactory =
      '0x0000000000000000000000000000000000000000'; // deploy pending

  /// Creator fan-token factory.
  static const String creatorTokenFactory =
      '0x0000000000000000000000000000000000000000'; // deploy pending

  /// Creator treasury (staking + revenue distribution).
  static const String creatorTreasury =
      '0x0000000000000000000000000000000000000000'; // deploy pending

  /// Agency registry (sign creators, track commissions).
  static const String agencyRegistry =
      '0x0000000000000000000000000000000000000000'; // deploy pending

  // ── Chain IDs ─────────────────────────────────────────────────────────────
  static const int chainIdL1 = 14000101;
  static const int chainIdL2 = 901;
  static const int chainIdL3 = 903; // GhostL3 — enforced for user transactions
}
