# DTN Governance Specification

## Overview

GhostChain supports **offline / air-gapped governance** via a Delay-Tolerant Network (DTN) relay.  
Governance proposals, votes, and parameter changes can be authored and signed offline, then transported
to an online relay node using intermittent connectivity (sneakernet, satellite, LoRa, IPFS, etc.).

---

## Protocol Layers

```
┌──────────────────────────────────────────────┐
│  Application Layer: governance artifacts     │  (proposals, votes, params)
├──────────────────────────────────────────────┤
│  Bundle Layer: @ghostchain/governance-bundle │  (Merkle tree, multi-sig, nonce)
├──────────────────────────────────────────────┤
│  Transport Layer: services/dtn-relay         │  (HTTP relay, LRU store)
├──────────────────────────────────────────────┤
│  CLI Layer: @ghostchain/dtn-cli              │  (pack, verify, push, pull)
└──────────────────────────────────────────────┘
```

---

## Governance Artifact Schema

Each governance artifact is a JSON object with the following required fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique artifact identifier (UUID or sequential) |
| `type` | `string` | `upgrade` \| `vote` \| `param-change` \| `treasury-action` |
| `chainId` | `number` | Target chain: L1=14000101, L2=901, L3=903 |
| `proposer` | `string` | Author address or DID |
| (type-specific fields) | varies | See below |

### Routing Law Enforcement (Non-Negotiable)
- Artifacts targeting L3 MUST route through L2 first — no direct L3→L1 bundles.
- Bundles with `chainId=903` (L3) are validated to reference a parent L2 bundle nonce.

---

## Bundle Format

```json
{
  "header": {
    "version": "1",
    "bundleId": "bundle-20260101-001",
    "chainId": 901,
    "nonce": 42,
    "createdAt": 1735689600,
    "validUntil": 1736294400,
    "artifactCount": 3,
    "merkleRoot": "a1b2c3..."
  },
  "artifacts": [...],
  "merkle": {
    "root": "a1b2c3...",
    "leaves": ["leaf0", "leaf1", "leaf2"],
    "proofs": [...]
  },
  "bundleDigest": "sha256-of-header+leaves",
  "signatures": [
    {
      "keyId": "governor-1",
      "algorithm": "RSA-SHA256",
      "signature": "base64...",
      "signedAt": 1735689600
    }
  ]
}
```

---

## Security Properties

| Property | Mechanism |
|----------|-----------|
| Integrity | SHA-256 Merkle tree over all artifacts |
| Authenticity | RSA-SHA256 multi-sig; threshold ≥ 1 (configurable) |
| Replay protection | Monotonic per-bundleId nonce; relay rejects non-advancing nonces |
| Expiry | `validUntil` Unix timestamp; bundles rejected after expiry |
| Transport | DTN relay is authentication-free for ingestion; verification is done by consuming node |

---

## Offline Workflow

```
1. Governance author drafts proposals.json (offline)
2. dtn pack --artifacts proposals.json --chain-id 901 --nonce N --private-key gov.pem --key-id gov-1
3. (Optional) Co-signer adds signature: dtn sign --bundle bundle.json --private-key co.pem --key-id co-1
4. Bundle transported to relay node (USB / satellite / LoRa burst)
5. dtn push --bundle bundle.json --relay http://relay.ghost.internal:7740
6. Online chain executor pulls: dtn pull --bundle-id <id> --relay http://relay.ghost.internal:7740
7. Executor runs: dtn verify --bundle pulled.json --keys allowed-keys.json --threshold 2
8. If valid → submit to on-chain GovernanceExecutor for timelock-protected execution
```

---

## Replay Attack Prevention

The relay enforces strict nonce ordering per `bundleId`.  
A new ingest request for an existing `bundleId` is **rejected** unless its `nonce` is strictly greater
than the stored bundle's nonce. This prevents replaying old governance decisions.

Consuming nodes MUST additionally check nonce against on-chain state before executing.

---

## Brand & Constitutional Compliance

DTN governance bundles are subject to all GhostChain constitutional invariants:

- Routing Law: L3→L2→L1 only
- Brand Law: No GHOST/GST metadata mutations via unsigned bundles
- All bundle signers must appear in `infra/safeops/allowlist.yml`
