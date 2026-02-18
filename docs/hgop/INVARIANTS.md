# HGOP Invariants

HGOP must not weaken GhostChain sovereignty or introduce bypass paths.

## Protocol / Operations

1. **Mainnet proposal-only**
   - No fix execution is allowed on mainnet (`/execute` hard-blocked).
2. **Deterministic ranking**
   - Same input must yield the same ordered fix list.
3. **Non-destructive by default**
   - v1 executor records intent and returns `blocked` unless explicitly extended.

## Layering (Sovereignty)

4. **Routing order**
   - Forward: `L1 -> L2 -> L3`
   - Reverse: `L3 -> L2 -> L1`
5. **No bypass**
   - HGOP must never provide automation or configuration that allows L3 to directly finalize to L1, or L2/L3 to route externally without L1 gates.

HGOP is a supervisor and proposal generator; it is not a bridge replacement.

