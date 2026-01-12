# OP-Stack 3-Layer Testnet Deployment Checklist (GhostLayer3 → GhostLayer2 → GhostLayer1)

Below is a battle-tested, testnet-ready deployment checklist for a 3-layer OP Stack hierarchy:

```
L3 (GhostLayer3) → L2 (GhostLayer2) → L1 (GhostLayer1 / Ethereum-compatible)
```

This is written so you can literally check boxes and avoid the proposer / oracle / bridge failures you’ve been hitting.

---

## 🛫 Quick Preflight (one command)

```bash
bash infra/scripts/opstack/preflight-3layer.sh infra/opstack/.env infra/opstack/.env.l3
```

What it does (red/green):
- Confirms L1/L2/L3 RPC reachability + chain IDs (and compares to env if present).
- Ensures chain IDs are unique across layers.
- Verifies OutputOracles (L2→L1 and L3→L2) have bytecode and respond to `version()` on the correct parent chain.
- Checks portals/SystemConfig/StandardBridge/game factory addresses on parent chains (if provided).
- Warns if L2/L3 data dirs are non-empty (stale genesis risk).

Set these in your envs before running:
- `L1_RPC`, `L2_RPC`, `L3_RPC`
- `L1_CHAIN_ID`, `L2_CHAIN_ID`, `L3_CHAIN_ID` (optional but recommended)
- `L2_OUTPUT_ORACLE_ADDRESS` (or `L2OO_ADDRESS`)
- `L3_OUTPUT_ORACLE_ADDRESS` (or `L3_L2OO_ADDRESS`)
- (Optional, recommended) `L2_PORTAL_ADDRESS`, `L2_SYSTEM_CONFIG_ADDRESS`, `L2_STANDARD_BRIDGE_ADDRESS`, `L2_GAME_FACTORY_ADDRESS`
- (Optional, recommended) `L3_PORTAL_ADDRESS`, `L3_SYSTEM_CONFIG_ADDRESS`, `L3_STANDARD_BRIDGE_ADDRESS`, `L3_GAME_FACTORY_ADDRESS`

Populate L1-derived L2 addresses from deployment artifacts:
```bash
bash infra/scripts/opstack/sync-env-from-l1-deployments.sh infra/opstack/.env
```

---

## 🗺️ Reference Architecture (sanity anchor)

![Image](https://specs.optimism.io/static/assets/propagation.svg)

![Image](https://bunny-wp-pullzone-nb318evfcx.b-cdn.net/wp-content/uploads/2023/09/OP-chain-simplified-2-715x1024.png)

![Image](https://mintcdn.com/optimism-373f39ad/ykMlxWT3aobN0A--/public/img/op-stack/protocol/op-cross-chain-txn.jpeg?auto=format&fit=max&n=ykMlxWT3aobN0A--&q=85&s=fc737142d43fde9076f0814b6ed2f9c5)

---

# ✅ PHASE 0 — Preconditions (DO NOT SKIP)

### 🔐 Accounts & Funding

* [ ] **One funded EOA per layer**
  * L1 deployer
  * L2 deployer
  * L3 deployer
* [ ] ETH for:
  * L1 contract deployments
  * L2 & L3 proposer gas
* [ ] Private keys stored securely (Vault / env)

---

### 🌐 RPCs

* [ ] Stable **L1 RPC** (HTTP + WS recommended)
* [ ] Stable **L2 RPC**
* [ ] Stable **L3 RPC**
* [ ] RPC chain IDs verified with:

  ```bash
  cast chain-id --rpc-url <RPC>
  ```

---

# ✅ PHASE 1 — Chain Identity (ABSOLUTE REQUIREMENT)

### Chain IDs (must be unique)

* [ ] L1_CHAIN_ID ≠ L2_CHAIN_ID ≠ L3_CHAIN_ID
* [ ] Chain IDs match:
  * `genesis.json`
  * `rollup.json`
  * `.env`
  * node configs

❌ Reusing chain IDs = silent message failure

---

# ✅ PHASE 2 — L1 CONTRACT DEPLOYMENT

### Mandatory L1 Contracts

Deploy **on L1**:

* [ ] `SystemConfig`
* [ ] `OptimismPortal`
* [ ] `L1CrossDomainMessenger`
* [ ] `L1StandardBridge`
* [ ] `L2OutputOracle` **OR**
* [ ] `DisputeGameFactory` (fault-proof stack)

### Verify deployment

```bash
cast code <ADDRESS> --rpc-url $L1_RPC
```

✔️ must return bytecode  
❌ empty = not deployed

---

# ✅ PHASE 3 — L2 CONFIGURATION (Parent = L1)

### L2 Genesis

* [ ] `l1ChainId` correct
* [ ] `l2ChainId` correct
* [ ] `L1CrossDomainMessenger` address set
* [ ] `L1StandardBridge` address set

---

### L2 Contracts (on L2)

* [ ] `L2CrossDomainMessenger`
* [ ] `L2StandardBridge`
* [ ] Output root receiver (from L3)

---

# ✅ PHASE 4 — L3 CONFIGURATION (Parent = L2)

### L3 Genesis

* [ ] `l2ChainId` correct
* [ ] `l3ChainId` correct
* [ ] `L2CrossDomainMessenger` address set
* [ ] `L2StandardBridge` address set

---

### L3 Contracts

* [ ] `L3CrossDomainMessenger`
* [ ] `L3StandardBridge`

---

# ✅ PHASE 5 — OUTPUT ORACLES (MOST COMMON FAILURE POINT)

### Required Oracles

* [ ] **L2 → L1 OutputOracle**
* [ ] **L3 → L2 OutputOracle**

### Must be true

* [ ] Oracle address ≠ zero address
* [ ] Oracle deployed on **correct parent chain**
* [ ] ABI matches proposer binary

### Test oracle manually

```bash
cast call <ORACLE_ADDR> "version()(string)" --rpc-url <PARENT_RPC>
```

✔️ returns string  
❌ empty = proposer crash loop

---

# ✅ PHASE 6 — PROPOSER CONFIGURATION

### L3 Proposer (.env)

```env
ROLLUP_NODE_RPC=L3_RPC
PARENT_RPC=L2_RPC
OUTPUT_ORACLE_ADDRESS=<L3→L2 oracle>
```

---

### L2 Proposer (.env)

```env
ROLLUP_NODE_RPC=L2_RPC
PARENT_RPC=L1_RPC
OUTPUT_ORACLE_ADDRESS=<L2→L1 oracle>
```

---

### Validate before running

```bash
cast code $OUTPUT_ORACLE_ADDRESS --rpc-url $PARENT_RPC
```

---

# ✅ PHASE 7 — DOCKER / NODE HYGIENE

### Required

* [ ] Fresh data dirs
* [ ] Writable permissions
* [ ] No stale genesis

```bash
rm -rf data/*
mkdir -p data/{l2,l3,proposer}
chmod -R 777 data
```

---

# ✅ PHASE 8 — BRIDGE WIRING CHECK

### L3 → L2

* [ ] `L3StandardBridge` points to L2 bridge
* [ ] Messenger address correct
* [ ] Gas limits reasonable

### L2 → L1

* [ ] `L2StandardBridge` points to L1 bridge
* [ ] Portal address correct

---

# ✅ PHASE 9 — SMOKE TESTS (MANDATORY)

### 1️⃣ Message test (L3 → L2)

* [ ] Send `sendMessage("ping")`
* [ ] Observe execution on L2

---

### 2️⃣ Message test (L2 → L1)

* [ ] Send `sendMessage("ping")`
* [ ] Wait challenge window
* [ ] Observe execution on L1

---

### 3️⃣ Value test

* [ ] Bridge **1 wei** L3 → L2
* [ ] Bridge **1 wei** L2 → L1

❌ Never start with tokens or large values

---

# ✅ PHASE 10 — FAULT & SAFETY CONTROLS (TESTNET LEVEL)

* [ ] Dispute games enabled (if fault proofs)
* [ ] Emergency pause at L2
* [ ] Rate limits on L3 messaging
* [ ] Manual finalization disabled on L3

---

# 🚨 COMMON TESTNET KILLERS (MEMORIZE)

| Mistake               | Symptom                   |
| --------------------- | ------------------------- |
| Wrong oracle address  | ABI empty string crash    |
| Oracle on wrong chain | Proposer restart loop     |
| Skipped SystemConfig  | Silent failures           |
| Chain ID reuse        | Messages never finalize   |
| ABI mismatch          | `failed to unpack result` |
| Stale data dirs       | Wrong genesis applied     |

---

## 🧾 FINAL RULE (tattoo this)

> **Each layer only trusts its parent, and every proposer must be able to call `version()` on its output oracle.**

---

If you want next, I can:

* 🔧 Generate a **preflight validation script** (one command, red/green output)
* 🧩 Provide **full Foundry deployment scripts**
* 🐳 Give you a **Docker Compose reference stack**
* 🧠 Add **GhostChain AI security hooks** at each layer

Just tell me.
