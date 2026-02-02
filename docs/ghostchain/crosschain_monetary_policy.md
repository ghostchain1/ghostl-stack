# Cross-Chain Ghost Monetary Policy

Purpose: Ensure a single canonical supply truth on L1 and consistent accounting across L2/L3.

Supply invariant:
  L1Supply = GenesisMint - sum(allBurns_L1_L2_L3) + sum(governanceApprovedMints)

Guarantees:
- L1 is the canonical supply source of truth.
- L2/L3 are accounting mirrors only.
- Cross-chain proofs reconcile burns, fees, and treasury flows.

Status: pending proof generation.
