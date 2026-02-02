# GhostAI Attestation Spec (EIP-712)

This document defines the canonical, deterministic attestation model for the GhostChain AI Contract Pack. On-chain contracts verify attestations only; they do not run AI inference.

## EIP-712 Domain

Domain fields:

- `name`: `"GhostAI"`
- `version`: `"1"`
- `chainId`: runtime chain ID
- `verifyingContract`: the on-chain attestation hub address

Domain type string:

```text
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
```

Domain typehash (keccak256 of the type string):

- `DOMAIN_TYPEHASH`: `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f`

## Canonical Attestation Struct

Struct name: `AIAttestation`

Fields:

- `bytes32 attestationId`
- `uint256 issuedAt`
- `uint256 expiresAt`
- `uint32 modelVersion`
- `bytes32 modelCardHash`
- `bytes32 inputHash`
- `bytes32 outputHash`
- `uint16 riskScoreBps`
- `uint8 confidence`
- `address subject`
- `uint256 nonce`
- `uint8 layer` where `1 = L1`, `2 = L2`, and `3 = L3`
- `bytes32 explanationRef`

Attestation type string:

```text
AIAttestation(bytes32 attestationId,uint256 issuedAt,uint256 expiresAt,uint32 modelVersion,bytes32 modelCardHash,bytes32 inputHash,bytes32 outputHash,uint16 riskScoreBps,uint8 confidence,address subject,uint256 nonce,uint8 layer,bytes32 explanationRef)
```

Attestation typehash (keccak256 of the type string):

- `AI_ATTESTATION_TYPEHASH`: `0xd1d84c36dfff363e325c2bd313abc2468440fe41ddf182f05e52da294beaf710`

## Canonical Attestation ID

`attestationId` is derived from the payload without `attestationId` itself. This avoids recursion and ensures the ID is stable across off-chain and on-chain implementations.

Canonical definition:

```solidity
attestationId = keccak256(
  abi.encode(
    issuedAt,
    expiresAt,
    modelVersion,
    modelCardHash,
    inputHash,
    outputHash,
    riskScoreBps,
    confidence,
    subject,
    nonce,
    layer,
    explanationRef
  )
);
```

## Validity and Replay Rules

These rules are enforced by contracts in the AI Contract Pack:

- The signer must be allowlisted in the on-chain AI oracle registry.
- Nonces are tracked per signer; a nonce may be used at most once.
- `expiresAt` must be greater than or equal to the current block timestamp.
- `issuedAt` must be less than or equal to the current block timestamp.
- The EIP-712 domain binds the attestation to a specific `chainId` and `verifyingContract`.
- The attestation’s `layer` value must match the configured layer for the deployment.
- `attestationId` must equal the canonical ID computed from the payload without `attestationId`.
- Optional revocation may be supported by marking a prior `attestationId` as revoked.

## Golden Vector (Cross-Implementation Reference)

The following golden vector is used to validate that TypeScript and Solidity hashing agree. The derived values were computed using `cast abi-encode` and `cast keccak`.

Golden vector inputs:

- `chainId`: `901`
- `verifyingContract`: `0x1111111111111111111111111111111111111111`
- `issuedAt`: `1700000000`
- `expiresAt`: `1700003600`
- `modelVersion`: `1`
- `modelCardHash`: `0xffbafac33bae212e532270a7a92fcf337d4b6b0dd8eadbd50f1161d1096d214f`
- `inputHash`: `0x94c58e36f93af84b7aaa6f1f298e1f17719ac0f716089415dd7b0fc52462140b`
- `outputHash`: `0xdf2e094cda4de966de648b49bb33e4cc78940d8747c74548217090b9a507ce9f`
- `riskScoreBps`: `4200`
- `confidence`: `90`
- `subject`: `0x2222222222222222222222222222222222222222`
- `nonce`: `7`
- `layer`: `2`
- `explanationRef`: `0x25f17a5547d007cc33c05585a1b4bc36de866223ffbce942244767c2d4e13ecd`

Golden vector derived values:

- `attestationId`: `0x91444930e049cc24ddd8ef8fe22a135eae718a0d97b7d4eafd2a064fb73128a8`
- `domainSeparator`: `0xece9faf26844d24ba605c423fcaafd1f9da86be06897d04c7a0587c525ab7270`
- `structHash`: `0x11e900b3d487b3a8642f217ce5fa6c7db6835e688bf289a0e9883d13159df1c2`
- `digest`: `0xce5daddbf1875a95c4e3a1f901469d3ab824a502ff53f02a33e6b11a1eee6282`

## Evidence

- Phase 2 log: `docs/evidence/ai-pack/build_logs/phase2.log`
