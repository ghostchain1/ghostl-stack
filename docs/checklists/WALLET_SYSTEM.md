# 🧿 GhostChain Wallet System (Built-In)

*A native GhostChain wallet engine with multi-chain, multi-token support.*

This module provides **wallet creation, import, token discovery, and management** for **GhostChain L1 / GhostLayer2 / GhostLayer3**, without relying on third-party wallets.

---

## 1) Wallet Capabilities (Required)

### Core Wallet Features
- [ ] Create new GhostChain wallet (HD / single-key)
- [ ] Import wallet by:
  - [ ] Private key
  - [ ] Mnemonic (BIP-39)
  - [ ] JSON keystore
  - [ ] Address only (watch-only)
- [ ] Hardware / external signer support (future)
- [ ] Wallet labels & tags
- [ ] Multiple accounts per wallet (HD paths)
- [ ] Wallet locking / session timeout
- [ ] Soft delete + recovery window
- [ ] Full audit logging

---

## 2) Token Import & Management (Critical)

### Supported Assets
- [ ] Native coin (GhostChain gas token / per-layer gas token)
- [ ] Canonical GST (ERC‑20) at `0x5FbDB2315678afecb367f032d93F642f64180aa3` (L1 source for L2/L3 gas)
- [ ] ERC-20 tokens
- [ ] ERC-721 NFTs
- [ ] ERC-1155 multi-tokens
- [ ] Wrapped native tokens (bridged assets)
- [ ] Custom GhostChain tokens

### Token Import Methods
- [ ] Auto-detect known tokens (chain registry)
- [ ] Manual token import by contract address
- [ ] Import via explorer scan
- [ ] Import via transaction history scan
- [ ] Import via token list JSON (Uniswap-style)

### Token Metadata
- [ ] Symbol
- [ ] Name
- [ ] Decimals
- [ ] Logo URI
- [ ] Token type (ERC-20 / 721 / 1155)
- [ ] Verified / unverified flag
- [ ] Risk warning for unverified tokens

---

## 3) Wallet UX (Futuristic UI)

### Wallet Dashboard
- [ ] Total portfolio value (per chain + aggregate)
- [ ] Balance cards with neon glow
- [ ] Chain selector (L1 / L2 / L3)
- [ ] Token list with live price (if enabled)
- [ ] NFT gallery view
- [ ] Activity timeline

### Token Import UI
- [ ] “Import Token” modal
- [ ] Paste contract address
- [ ] Auto-fetch metadata
- [ ] Manual override fields
- [ ] Validation + checksum check
- [ ] Warning screen for unknown contracts
- [ ] One-click add/remove token

### Transaction Builder
- [ ] Send native token
- [ ] Send ERC-20
- [ ] Transfer NFT
- [ ] Approve token allowances
- [ ] Revoke approvals UI
- [ ] Gas estimation (EIP-1559)
- [ ] Nonce management
- [ ] Simulation / dry-run (if enabled)

---

## 4) Backend Wallet Engine

### Wallet Service
- [ ] Key generation (secp256k1)
- [ ] Mnemonic generation (BIP-39)
- [ ] HD derivation (BIP-32 / 44)
- [ ] Address validation
- [ ] Checksum enforcement
- [ ] Encrypted key storage (Vault or AES-256)
- [ ] No plaintext key access

### Token Indexer
- [ ] Balance fetcher (RPC)
- [ ] Token transfer indexer
- [ ] NFT ownership indexer
- [ ] Allowance tracker
- [ ] Cached balances (Redis)
- [ ] Realtime updates (WS)

---

## 5) Database Additions

### Wallet Tables
- `wallets`
- `wallet_accounts`
- `wallet_keys` (encrypted or vault refs)
- `wallet_sessions`

### Token Tables
- `tokens`
- `wallet_tokens`
- `token_balances`
- `token_allowances`
- `nft_holdings`

### Example: `tokens`
```sql
id
chain_id
contract_address
symbol
name
decimals
type
logo_uri
verified
created_at
```

---

## 6) API Endpoints (Wallet & Tokens)

### Wallet

* [ ] `POST /wallets/create`
* [ ] `POST /wallets/import/private-key`
* [ ] `POST /wallets/import/mnemonic`
* [ ] `POST /wallets/import/address`
* [ ] `GET  /wallets/:id`
* [ ] `DELETE /wallets/:id`

### Tokens

* [ ] `POST /wallets/:id/tokens/import`
* [ ] `GET  /wallets/:id/tokens`
* [ ] `DELETE /wallets/:id/tokens/:tokenId`
* [ ] `GET  /wallets/:id/balances`

### Transactions

* [ ] `POST /wallets/:id/tx/build`
* [ ] `POST /wallets/:id/tx/sign`
* [ ] `POST /wallets/:id/tx/send`
* [ ] `GET  /wallets/:id/tx/history`

---

## 7) Security & Safety Rules (Non-Negotiable)

* [ ] Keys NEVER leave secure storage
* [ ] Private keys never returned via API
* [ ] Sensitive actions require re-auth
* [ ] MFA for wallet export / deletion
* [ ] Transaction simulation before send
* [ ] Contract address checksum validation
* [ ] Token approval risk warnings
* [ ] Daily spend limits
* [ ] Chain-specific allowlists

---

## 8) GhostChain-Specific Enhancements

* [ ] GhostChain native token auto-import
* [ ] Cross-layer balance view (L3 → L2 → L1)
* [ ] Bridged token tagging
* [ ] Rollup-aware gas estimates
* [ ] AI fraud detection hook (optional)
* [ ] Validator/operator wallet mode
* [ ] Governance voting wallet support

---

## 9) Optional Advanced Features (Future)

* [ ] Account abstraction (ERC-4337)
* [ ] Smart contract wallets
* [ ] Social recovery
* [ ] Multi-sig wallets
* [ ] MPC wallets
* [ ] Wallet connect compatibility
* [ ] Fiat on/off ramp integration

---

## 10) Definition of Done (Wallet)

* [ ] User can create/import wallet
* [ ] User can import any token safely
* [ ] Balances update in real time
* [ ] Transactions execute correctly
* [ ] Audit logs record every action
* [ ] UI feels futuristic, fast, and safe
* [ ] Works across GhostChain L1/L2/L3

---
