# Cross-Chain AI Federation (L1 ↔ L2 ↔ L3)

GhostChain uses a sovereign but federated governance model:

- **L1 is the constitutional root** for chain-wide policy constraints.
- **L2 inherits L1 chain policy checkpoints** and may only act within those bounds.
- **L3 inherits L2 constraints** (and by extension L1), never overriding higher-layer policy.

This keeps local autonomy while preserving a single constitutional source of truth.

## Policy checkpoints

The L1 `PolicyRegistry` emits policy checkpoints that define the allowable envelope for lower layers.
L2 and L3 AI monitors must reference these checkpoints when evaluating actions.

Export a policy checkpoint:

```bash
POLICY_CHECKPOINT_NETWORK=anvil \
POLICY_CHECKPOINT_LAYER=L1 \
infra/scripts/federation/export-policy-checkpoint.sh
```

Optional overrides:

```bash
POLICY_KEYS=ghost.policy.gas.max,ghost.policy.gas.min \
POLICY_CHECKPOINT_NETWORK=ghostl2 \
POLICY_CHECKPOINT_LAYER=L2 \
infra/scripts/federation/export-policy-checkpoint.sh
```

Artifacts are written to `infra/evidence/out/policy-checkpoint-<layer>-<timestamp>.json` and include:
- registry address + constitution hash
- current/pending/emergency policy values
- deterministic checkpoint hash

## Evidence anchoring across layers

Evidence bundles produced by L2/L3 should be anchored upstream:

- L2 evidence hashes are committed to the L1 `EvidenceVault` (preferred), or
  recorded in checkpoint metadata and archived in `infra/evidence/out`.
- L3 evidence hashes are committed to the L2 `EvidenceVault` (preferred), or
  recorded in L2 checkpoints for later L1 anchoring.

This preserves provenance and prevents lower layers from masking evidence.

## Federation invariants

- **Authority chain:** L3 ⊆ L2 ⊆ L1 (no lower layer may expand its authority).
- **Constitutional lock:** L2/L3 policy registries must reference the same constitution hash
  or be explicitly delegated by the L1 governance executor.
- **Evidence lineage:** each lower-layer proposal references a higher-layer checkpoint hash
  or evidence hash committed upstream.

## Required environment variables

For L2 AI monitor (anchored to L1):

```
CHAIN_POLICY_REGISTRY_ADDRESS=0x<L1 PolicyRegistry>
CHAIN_POLICY_REGISTRY_RPC=http://localhost:18545
CHAIN_POLICY_REQUIRED=1
```

For L3 AI monitor (anchored to L2):

```
CHAIN_POLICY_REGISTRY_ADDRESS=0x<L2 PolicyRegistry>
CHAIN_POLICY_REGISTRY_RPC=http://localhost:9545
CHAIN_POLICY_REQUIRED=1
```

These settings ensure the AI monitor refuses to act if the upstream policy registry is missing
or unreachable.
