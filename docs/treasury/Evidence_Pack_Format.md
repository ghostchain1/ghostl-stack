# Treasury Evidence Pack Format

## 1. Purpose

The evidence pack is a deterministic, court-ready bundle that proves:

- Who authorized the action (governance outcome)
- What was executed (calldata + receipts)
- When it occurred (block/time)
- Under what policy (policy hash/version)
- Why it occurred (AI rationale + risk score)
- That it complied (invariants + receipts)

## 2. Canonical Fields

Top-level JSON fields:

```
{
  "version": "1.0",
  "chainId": <uint>,
  "fromBlock": <uint>,
  "toBlock": <uint>,
  "generatedAt": <ISO-8601 timestamp>,
  "receipts": [<Receipt>...],
  "governance": {
    "proposals": [<Proposal>...],
    "votes": [<Vote>...],
    "queues": [<Queue>...],
    "executions": [<Execution>...]
  },
  "timelock": {
    "executor": <address>,
    "delay": <uint>,
    "queued": [<QueuedTx>...],
    "executed": [<ExecutedTx>...]
  },
  "ai": {
    "rationale": <json|text|null>,
    "report": <json|text|null>,
    "riskScore": <uint|null>,
    "modelHash": <bytes32|null>,
    "attestation": <signature|null>
  },
  "hashes": {
    "receiptsRoot": <bytes32>,
    "governanceRoot": <bytes32>,
    "aiHash": <bytes32>,
    "packHash": <bytes32>
  },
  "signature": {
    "signer": <address>,
    "signature": <bytes>
  }
}
```

`Receipt` is serialized from `TreasuryReceipts` and MUST include:

- `receiptId`, `actionHash`, `policyHash`, `policyVersion`, `actionType`
- `asset`, `target`, `amount`, `value`, `chainId`, `timestamp`
- `executor`, `metadataHash`, `aiProposalHash`, `aiRiskScoreBps`, `treatyId`

## 3. Hashing Rules

1. JSON is canonicalized with `stableStringify`:
   - Objects have lexicographically sorted keys.
   - Arrays preserve order.
   - Big integers are stringified.
2. Hash function is `keccak256(utf8_bytes(stableStringify(value)))`.
3. `packHash` is computed over the entire pack with `hashes.packHash` set to the empty string.

## 4. Signature Scheme

Evidence packs are signed using the repo’s standard ECDSA pattern (EIP-191 message signing), aligned with `services/ghost-compliance`:

- `digest = keccak256(utf8_bytes(stableStringify(pack_without_signature)))`
- `signature = signMessage(digest)` using the evidence signer key
- The verifier recovers the signer via `verifyMessage`.

## 5. Merkle Tree Layout

Merkle roots are computed for `receipts` and `governance` lists:

- Leaves are `hashOf(each_entry)`.
- Leaves are sorted lexicographically.
- Pairs are hashed as `hashOf([left, right])`.
- If a level has an odd count, the last leaf is duplicated.
- Root is `receiptsRoot` / `governanceRoot`.

A `evidence_pack.merkle` file is emitted with roots + leaf lists.

## 6. Replay Procedure

1. Verify `packHash` matches the pack contents.
2. Recompute Merkle roots and compare to `hashes.receiptsRoot` and `hashes.governanceRoot`.
3. Verify the signature matches the expected evidence signer.
4. (Optional) Cross-check on-chain receipts and governance logs against the included data.

