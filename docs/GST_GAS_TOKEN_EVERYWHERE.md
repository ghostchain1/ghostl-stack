# GST as Native Gas Token — Full System Runbook

**Canonical token**: name `Ghost`, symbol `GST`, decimals `18`  
**Canonical ERC20 address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3`

---

## Architecture — How GST Is Gas at Every Layer

```
L3 (chainId 903)  ─ native gas = GST ─┐
                                        │ (L3 batches → L2)
L2 (chainId 901)  ─ native gas = GST ─┤
                                        │ (L2 settles → L1)
L1 (chainId 14000101) ─ native = GST ──┘
```

### L1: GhostChain (Clique PoA geth fork)

The native unit on GhostChain IS GST.  Geth genesis format does not carry a `nativeCurrency`
field — the native unit is determined by the chain's economic design and client branding.
No ETH assumption exists in the genesis or client config.

Genesis alloc: `infra/ghostchain/geth/genesis.json`  
Chain ID: `14000101`  
Clique period: `2s`  
Explorer COIN: `GST` (set in `infra/ghostchain/docker-compose.l1.yml`)

### L2: GhostL2 (OP Stack, ERC20 gas token)

OP Stack supports a custom ERC20 gas token via `config.gasToken` in genesis.  
L2 execution (op-geth) treats the ERC20 at that address as the native currency instead of ETH.

Genesis: `infra/opstack/config/genesis-l2.json`

```json
"config": {
  "chainId": 901,
  "gasToken": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "nativeCurrency": { "name": "Ghost", "symbol": "GST", "decimals": 18 }
}
```

Rollup config: `infra/opstack/config/rollup.json`  
Chain ID: `901`

### L3: GhostL3 (OP Stack L3, L2 is its "L1")

Same mechanism — ERC20 gas token in genesis, L2 (chainId 901) acts as L3's settlement layer.

Genesis: `infra/opstack/l3/ghostl3/config/genesis.json`

```json
"config": {
  "chainId": 903,
  "gasToken": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "nativeCurrency": { "name": "Ghost", "symbol": "GST", "decimals": 18 }
}
```

Rollup config: `infra/opstack/l3/ghostl3/config/rollup.json`  
Chain ID: `903`

---

## Node-by-Node GST Enforcement

| Node | Component | GST enforcement mechanism |
|------|-----------|--------------------------|
| L1 geth | EL | Native unit IS GST; no ETH assumption in genesis |
| L1 ghostscout | Explorer | `COIN=GST`, `COIN_NAME=Ghost` in compose |
| L2 op-geth | EL | `config.gasToken` in genesis-l2.json |
| L2 op-node | Rollup | Reads rollup.json; no currency enum |
| L2 op-batcher | Batch submitter | `--l1-eth-rpc` / `--l2-eth-rpc` are flag names, not currency |
| L2 op-proposer | State proposer | Same — flag names only |
| L2 op-challenger | Dispute | Same — flag names only |
| L2 ghostscout | Explorer | `COIN=GST`, `COIN_NAME=Ghost` |
| L2 ghostscout-frontend | UI | `NEXT_PUBLIC_NETWORK_CURRENCY_SYMBOL=GST` |
| L3 op-geth | EL | `config.gasToken` in genesis.json |
| L3 op-node | Rollup | Reads rollup.json |
| L3 op-batcher | Batch submitter | Fee vault in GST |
| L3 ghostscout | Explorer | `COIN=GST`, `COIN_NAME=Ghost` |
| L3 ghostscout-frontend | UI | `NEXT_PUBLIC_NETWORK_CURRENCY_SYMBOL=GST` |
| ghost-gas-engine | Service | `GAS_TOKEN_L1/L2/L3=GST` env; `gasTokenName: "Ghost"` in chains.json |
| ghost-registry | Service | `CANONICAL_GAS_TOKEN_NAME='Ghost'` |
| ghost-pil | Service | `gasTokenSymbol: "GST"` in chains.json; chainIds `14000101/901/903` |
| ghost-rpc-proxy | RPC | `RPC_ENABLE_GST_NAMESPACE=1`, `RPC_DEPRECATE_LEGACY_NAMESPACE=1` |
| apps/web wallet | UI | native token symbol defaults to `GST`; chain metadata in tokens.ts |

> **Note on `--l1-eth-rpc` / `--l2-eth-rpc`**: These are OP Stack binary CLI flag names (ghostchaincompatible JSON-RPC endpoint). The `eth` part refers to the wire protocol, not the currency. These cannot and should not be changed.

> **Note on `--http.api=eth,net,web3`**: This is the JSON-RPC namespace string. `eth_` prefixed methods are the Ethereum wire protocol standard. Not a currency value.

---

## Deployer / Env Var Reference

All `.env` files sourced from `infra/opstack/.env.sample`:

```dotenv
USE_CUSTOM_GAS_TOKEN=true
CUSTOM_GAS_TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
GAS_TOKEN_NAME="Ghost"
GAS_TOKEN_SYMBOL=GST
GAS_TOKEN_DECIMALS=18
GAS_TOKEN_INITIAL_SUPPLY=1000000000000000000000000000
```

---

## CI Gate

`scripts/gst-symbol-gate.sh` enforces two rules:

### Rule 1 — Legacy symbol ban
Bans these patterns from first-party code/config (word-boundary matched):
- `GHOST` — original deprecated symbol
- `gGHOST` — wrapped variant
- `GTK`, `GTL2`, `GTL3` — per-layer legacy fallback symbols used by old wallet code

### Rule 2 — ETH-as-currency ban
Bans `"ETH"` appearing as a native currency symbol value in config files (`.json`, `.yml`, `.yaml`, `.env*`):
- `"symbol": "ETH"` in JSON
- `"currency": "ETH"` in JSON
- `COIN: ETH` in YAML
- `GAS_TOKEN_SYMBOL=ETH` in env files

Exclusions: CLI flag text in compose `command:` blocks is not flagged (rule is pattern-based on value context).

Run the gate locally:
```bash
bash scripts/gst-symbol-gate.sh
```

---

## Wallet / MetaMask Chain Add Parameters

When calling `wallet_addEthereumChain` or `wallet_switchEthereumChain`, always pass:

```js
// GhostChain (L1)
{
  chainId: '0xD59EB5',      // 14000101
  chainName: 'GhostChain',
  rpcUrls: ['https://rpc.ghostchain.io'],
  nativeCurrency: { name: 'Ghost', symbol: 'GST', decimals: 18 },
  blockExplorerUrls: ['https://explorer.ghostchain.io']
}

// GhostL2
{
  chainId: '0x385',         // 901
  chainName: 'GhostL2',
  rpcUrls: ['https://rpc.l2.ghostchain.io'],
  nativeCurrency: { name: 'Ghost', symbol: 'GST', decimals: 18 },
  blockExplorerUrls: ['https://explorer-l2.ghostchain.io']
}

// GhostL3
{
  chainId: '0x387',         // 903
  chainName: 'GhostL3',
  rpcUrls: ['https://rpc.l3.ghostchain.io'],
  nativeCurrency: { name: 'Ghost', symbol: 'GST', decimals: 18 },
  blockExplorerUrls: ['https://explorer-l3.ghostchain.io']
}
```

---

## GST Economic Loop

```
L3 transaction fee (GST)
      │
      ▼  (batch tx)
L2 sequencer collects GST fees → sequencerFeeVault
      │
      ▼  (settlement tx)
L1 validator/proposer collects GST → validatorFeeVault
      │
      ▼
Treasury AI (ghost-pil / econ engine)
 ├── burn %  → deflationary pressure
 ├── staking rewards → validator GST emission
 ├── buyback → market support
 └── L2/L3 infrastructure fund
```

---

## Regenesis Warning

**GST is configured as the native gas token at genesis. Changing the gas token after chain launch requires a full regenesis.** The `config.gasToken` field in genesis is read-only once a chain is initialized. Any attempt to swap gas tokens on a live chain without a coordinated regenesis will result in:

1. Execution client rejecting block proposals (mismatched fee currency)
2. op-node failing state root calculations
3. Bridge / messaging contracts using wrong fee token

**Do not attempt live gas token migration. Plan regenesis in coordination with all node operators.**

---

## Verification Checklist (Run After Any Node Upgrade)

```bash
# 1. CI gate
bash scripts/gst-symbol-gate.sh

# 2. L1 — confirm chain returns no ETH denomination in RPC metadata
curl -s http://localhost:18545 -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected: {"result":"0xd59eb5",...}  (= 14000101)

# 3. L2 — node sync + genesis gasToken
curl -s http://localhost:28545 -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected: {"result":"0x385",...}  (= 901)

# 4. L3 chain ID
curl -s http://localhost:38545 -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# Expected: {"result":"0x387",...}  (= 903)

# 5. Explorer COIN check (L2 backend)
curl -s http://localhost:18643/api/v2/stats | python3 -m json.tool | grep -A2 coin
# Expected: "coin_symbol": "GST"

# 6. Ghost-gas-engine health
curl -s http://localhost:3000/health | python3 -m json.tool
# Expected: gasToken fields show GST for all chains

# 7. Ghost-pil chain registry
curl -s http://localhost:4000/chains | python3 -m json.tool
# Expected: chainIds 14000101, 901, 903 — gasTokenSymbol: GST on all
```
