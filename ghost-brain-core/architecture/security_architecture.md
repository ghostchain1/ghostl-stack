# GhostBrain — Security Architecture

## Principles

1. **No private keys in GhostBrain Core** — GhostBrain proposes; a separate key-holding relay signs.
2. **Attestation-gated execution** — Phase 4+ chiplets must pass remote attestation before kernel dispatch.
3. **Audit by default** — every decision is recorded to a JSONL audit trail + optional L2 webhook.
4. **Human ratification** — AI-generated governance proposals require on-chain human quorum before execution.
5. **Fail-closed** — on any security check failure, GhostBrain blocks the action (never permits by default).

## Threat Model

| Threat                             | Mitigation                                               |
|------------------------------------|----------------------------------------------------------|
| Compromised GhostBrain process     | Policy engine (kernel-level), rate limiting, ratification |
| Prompt injection in AI input       | Input sanitisation, output validation, HMAC audit log     |
| Replay of audit events             | Monotonic sequence counter + HMAC-SHA256 per event        |
| Side-channel on HBM                | Memory encryption (AES-256-XTS), scrubbing on dealloc     |
| Rogue firmware on chiplet          | Secure boot (`security/secure_boot/`), chain-of-trust    |
| Man-in-the-middle on webhook       | HMAC-SHA256 `x-ghostbrain-hmac` header, TLS mandatory    |
| Unauthorised governance proposal   | On-chain quorum required; AI cannot execute without vote  |
| Rate-limiting bypass               | Sliding window enforced at kernel level (before sim gate) |

## Secure Boot (`security/secure_boot/`)

### `bootloader.rs`
- Verifies firmware signature (Ed25519) using a public key baked into ROM
- Chain of trust: ROM key → bootloader → firmware → GhostBrain runtime
- Any verification failure halts boot; alert sent to governance monitor

### `firmware_verifier.rs`
- Validates BLAKE3 hash of each firmware blob against the on-chain manifest
- Manifest is stored in GhostChain L1 governance state (appendable by quorum only)
- Runs on every reset and on configurable interval (default: 60 min)

## Remote Attestation (`security/attestation/`)

### `chip_identity.rs`
- Each chiplet has a unique Ed25519 keypair burned at manufacture
- Private key lives in on-chip eFuse, never extractable
- Public key registered to GhostChain L1 identity contract at provisioning

### `remote_attestation.ts`
- Challenge-response protocol: GhostBrain Core sends nonce to chiplet
- Chiplet signs `nonce ‖ firmware_hash ‖ timestamp` with chip private key
- GhostBrain Core verifies signature against L1 identity contract
- Failed attestation: chiplet quarantined, health_monitor.cpp triggers alert

## Memory Encryption (`security/encryption/memory_encryption.ts`)

- Phase 4+ only; transparent to runtime (hardware engine on chiplet)
- Algorithm: AES-256-XTS (per-page tweak = physical page address)
- Key management: `key_manager.ts` derives page keys from master key via HKDF
- Master key stored in hardware security module (HSM) or Vault
- Key rotation: triggered by governance vote (on-chain) every 90 days

## Audit Log Security

See `services/ghostbrain-core/src/audit/chain_audit.ts`.

- HMAC-SHA256 over canonical field string per event
- Secret from `AUDIT_HMAC_SECRET` env var (set via HashiCorp Vault injection)
- Monotonic sequence counter ensures tampering detection
- Webhook posts use TLS + HMAC header; receiver must verify before storing

## Key Management (`security/encryption/key_manager.ts`)

- Keys never logged, never serialised to disk in plaintext
- Vault integration: secrets fetched at startup via `VAULT_ADDR` + `VAULT_TOKEN`
- Key rotation without downtime: new key derived, re-encryption runs in background pool
- Zeroisation: keys overwritten with zeros on process exit (via `process.on('exit', ...)`)
