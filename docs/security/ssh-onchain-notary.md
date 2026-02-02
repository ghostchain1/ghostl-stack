# SSH On-Chain Notary (GhostChain)

## Overview

This system records SSH access grants and login receipts on-chain, while maintaining privacy by hashing identities and keys. It supports two operational modes:

- **Audit mode (default)**: normal SSH behavior; all grants/logins are notarized.
- **Enforce mode**: SSH accepts only keys authorized on-chain.

## Components

- **SSHAccessRegistry** (`contracts/src/security/SSHAccessRegistry.sol`): on-chain source of truth for grants, revokes, attestors, and receipts.
- **ghost-authorized-keys** (`/usr/local/bin/ghost-authorized-keys`): SSH AuthorizedKeysCommand with audit/enforce modes.
- **ghost-ssh-attestor** (`/usr/local/bin/ghost-ssh-attestor` + systemd service): tails sshd logs and submits login receipts.
- **ghost-ssh-evidence-pack** (`/usr/local/bin/ghost-ssh-evidence-pack`): generates court-ready evidence bundles.

## Formal Invariants

1. **Enforce-mode correctness**: in `enforce` mode, no key is accepted unless `isAuthorized(serverId, principalHash, pubkeyHash)` is true.
2. **Grant traceability**: every access grant corresponds to an `AccessGranted` on-chain event.
3. **Attestor-only receipts**: `LoginReceipt` events can only be emitted by registered attestors for `serverId`.
4. **Immediate revocation**: revocation takes effect immediately; cache TTL must be bounded.
5. **Privacy by design**: only hashes of principals, server IDs, and public keys are stored on-chain.

## Verification Checklist

- `sshd -t` passes
- `ssh -vvv ghostchain` shows `Accepted public key`
- Contract emits:
  - `AccessGranted`
  - `LoginReceipt` on successful login
- Evidence pack generator produces deterministic hash

## Operational Files

- `/etc/ghost/ssh/enforcement.mode` → `audit` or `enforce`
- `/etc/ghost/ssh/keymap.json` → public key registry
- `/etc/ghost/ssh/server_id` → canonical server ID string

