# GhostChain Custom Rollup Architecture

> This document describes the target Ghost-native GhostL2 / GhostL3 execution stack
> and the partial scaffolding already present in this repo.
> It does not by itself imply parity, active devnet cutover, or production readiness.

## Current Status

- Ghost-native chain configs and service scaffolds exist in the repo.
- OP-era runtime, SDK, and operator dependencies still exist in the broader stack.
- Treat this document as target architecture plus migration scaffolding, not as proof of completion.

---

## Chain Topology

```
GhostChain L1  (chain_id=14000101, RPC :18545)
      │
      │  settlement (ghost-settlement L2)
      │  bridge     (ghost-bridge L2)
      │
GhostL2         (chain_id=901,       RPC :29547)
      │
      │  settlement (ghost-settlement L3)
      │  bridge     (ghost-bridge L3)
      │
GhostL3         (chain_id=903,       RPC :39545)
```

**Routing law (absolute constraint):**
- L3 → L2 → L1 only. L3 MUST NOT call L1 directly.
- Enforced at runtime by `packages/routing-guard/`.

---

## Custom Stack Modules

| Module             | Port | Responsibilities |
|--------------------|------|-----------------|
| `ghost-exec`       | 7260 | EVM execution engine wrapper, block execution & simulation, GST fee enforcement |
| `ghost-sequencer`  | 7261 | Mempool, block production, priority-fee ordering, batch forwarding to settlement |
| `ghost-deriver`    | 7262 | Batch ingestion from parent chain, state replay via exec, derivation cursor |
| `ghost-settlement` | 7263 | Output root posting to parent chain rollup, challenge-period enforcement, finality promotion |
| `ghost-bridge`     | 7264 | Cross-domain message relay, routing-law enforcement, retry queue |
| `ghost-proof`      | 7265 | Fraud-proof monitoring, dispute submission, ZK-proof interface (future) |

---

## Data Flow — Block Production (GhostL2 example)

```
User tx
  │
  ▼
ghost-sequencer /mempool/submit
  │  (priority-fee ordered batching every BLOCK_TIME_MS)
  ▼
ghost-exec /exec/block
  │  (EVM state transition, GST fee deduction)
  ▼
ghost-sequencer (receives executed block hash + state root)
  │  (async notify)
  ▼
ghost-settlement /batch
  │  (compute output root, post to L1 rollup contract)
  │  (wait CHALLENGE_PERIOD_SECONDS)
  │  (query ghost-proof /disputes/active)
  ▼
ghost-settlement promotes finalizedHead
```

---

## Data Flow — Batch Derivation (GhostL2 example)

```
GhostChain L1 (batch inbox contract)
  │  (ghost-deriver polls every POLL_INTERVAL_MS)
  ▼
ghost-deriver /admin/derive
  │  (fetch logs from L1 BATCH_INBOX_ADDRESS)
  ▼
ghost-exec /exec/block { batchData, replayMode }
  │  (replay — reconstruct canonical L2 state)
  ▼
ghost-deriver (advance cursor, persist to /state)
```

---

## Data Flow — Cross-Domain Messaging (L1 → L2)

```
L1 bridge contract emits MessagePassed(nonce, sender, target, value, data)
  │
  ▼
ghost-bridge (polls source chain logs, respects finalizedHead from settlement)
  │  (assertBridgeRoutingLaw: rejects L3→L1 direct)
  ▼
ghost-bridge relayMessage → L2 dest bridge contract
  │  (retry up to 3 attempts on failure)
  ▼
L2 target receives decoded message
```

---

## Data Flow — Fraud Proof (dispute example)

```
ghost-settlement posts output root O for block N
  │
  ▼
ghost-proof polls /commitments every POLL_INTERVAL_MS
  │  (replays block N via ghost-exec)
  │  (computes expected output root O')
  ▼
If O ≠ O': ghost-proof opens dispute, submits challenge tx to parent rollup
  │
  ▼
ghost-settlement sees hasActiveDispute=true for block N
  │  (holds finalization until dispute is resolved)
  ▼
Dispute resolved on-chain → operator calls /disputes/:id/resolve
  │
  ▼
ghost-settlement promotes finalizedHead for block N
```

---

## Chain Configs

- [`chains/ghostl2/chain.json`](../../../chains/ghostl2/chain.json) — GhostL2 canonical chain definition
- [`chains/ghostl2/genesis.json`](../../../chains/ghostl2/genesis.json) — GhostL2 genesis block
- [`chains/ghostl3/chain.json`](../../../chains/ghostl3/chain.json) — GhostL3 canonical chain definition
- [`chains/ghostl3/genesis.json`](../../../chains/ghostl3/genesis.json) — GhostL3 genesis block

---

## Canonical Bridge Addresses

| Contract          | Address |
|-------------------|---------|
| L2L3Bridge        | `0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2` |
| L1 Rollup (L2)    | `0xad32D5C2Da9f4159C4cc98686C005852b3905355` |
| L2 Rollup (L3)    | `0x130A46b6E41DB6E1e18fb9c759F223c459190e90` |
| Finality Oracle L1| `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422` |
| Finality Oracle L2| `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A` |
| Finality Oracle L3| `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127` |

---

## Phase Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Freeze OP-based L2/L3 as compatibility baseline | ✅ Done |
| 2 | Custom modules scaffolded behind compatible product/API boundaries | 🟡 Partial scaffolds present, parity pending |
| 3 | Dual-run devnet: old OP vs new Ghost modules, block comparison | 🔲 Scheduled |
| 4 | Cut apps, bridge, explorer, SDK to custom chain endpoints | 🔲 Scheduled |
| 5 | Remove OP-specific infra and configs after parity proven | 🔲 Scheduled |

---

## Acceptance Criteria

- [ ] No OP Stack runtime dependencies in GhostL2/GhostL3 production path
- [ ] Bidirectional messaging: L1 ↔ L2 and L2 ↔ L3
- [ ] No L3 → L1 direct bypass (routing-guard enforced)
- [ ] Unified Ghost branding: wallets, explorers, bridge, admin, governance, SDK
- [ ] Devnet promotion gates pass before testnet promotion

---

## Gas Token

The target design is GST-only. There is no ETH, WETH, or alternate gas token in the intended custom runtime.
Any promoted Ghost-native execution path must preserve GST-denominated fee handling.

---

## Security Notes

- Private keys for sequencer, proposer, relayer, and challenger are never stored in env vars
  in production — use `*_FILE` variants pointing to Docker secrets or Vault paths.
- Public RPC surfaces must use `ghost_` namespace rather than `eth_`.
- `ghost-bridge` rejects any message where `sourceChain=903` and `destChain=14000101`
  (L3→L1 bypass), enforcing the routing law at the bridge level.
- `ghost-settlement` will not finalize a block if `ghost-proof` reports an active dispute.
