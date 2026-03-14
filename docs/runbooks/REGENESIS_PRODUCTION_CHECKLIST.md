# Production Regenesis Checklist (GhostChain + GhostL2 + GhostL3)

> Use when you must rebuild genesis / redeploy chains.
> WARNING: Regenesis resets chain history/state. Treat as a new network launch.
> Chain IDs: L1=14000101, L2=901, L3=903

---

## Phase 0 — Decision Lock

- [ ] Confirm regenesis is required (native branding/gas identity cannot be safely changed in-place).
- [ ] Confirm chain IDs will be updated or intentionally preserved (avoid wallet collisions).
- [ ] Confirm bridge exception policy: bridges remain neutral/external-friendly. Only `/contracts/src/bridge`, `/services/bridge`, `/infra/opstack/bridge`, `/apps/bridge` may carry foreign ticker references.
- [ ] Get sign-off from governance multisig or designated release authority.

---

## Phase 1 — Inventory & Backups

- [ ] Snapshot all node volumes: validators, RPC, sequencer, batcher, proposer, indexers.
- [ ] Export all current genesis/rollup configs (`L1 genesis.json`, `L2/L3 genesis + rollup.json`).
- [ ] Export all deployment registries:
  - `contracts/deployments/ghostl2/l1.json`
  - `contracts/deployments/ghostl2/l2.json`
  - `contracts/deployments/ghostl2/l3.json`
- [ ] Export contract artifacts (`out-codex/`) and broadcast logs (`broadcast/`).
- [ ] Backup monitoring dashboards (Grafana JSON), Prometheus rules, and alert configs.
- [ ] Backup environment files: `stack.env.example`, `services/**/.env`, `apps/**/.env`.
- [ ] Backup docker-compose files and Helm/Terraform manifests.
- [ ] Tag current git state: `git tag regenesis-pre-$(date +%Y%m%d)` and push.

---

## Phase 2 — Key Ceremonies & Secrets

- [ ] Decide: reuse validator/sequencer/batcher keys, or generate new keys (new keys recommended for fresh networks).
- [ ] Generate new deployer EOA if restarting devnet (Anvil account #0: `0xf39Fd6e51...`).
- [ ] Rotate/reseal Vault policies and re-issue AppRole `SecretID`s if used.
- [ ] Update allowlists and firewall rules for new bootnode/enode addresses.
- [ ] Re-run ghost-guard `.env` injection: `PRIVATE_KEY`, `AI_SIGNER_PRIVATE_KEY`, `AI_GUARDIAN_L*_ADDRESS`, `ADMIN_TOKEN`.
- [ ] Re-run ghost-relayer `.env` injection: `RELAYER_PRIVATE_KEY`, `L2_RELAYER_PRIVATE_KEY`.
- [ ] Re-run proposer and challenger `.env` injections.

---

## Phase 3 — L1 (GhostChain) Regenesis

- [ ] Generate new L1 genesis with GST-branded alloc + correct `chainId = 14000101`.
  - `gasToken` entry in genesis with correct address
  - premine: treasury, validators, governance multisig
- [ ] Set `nativeCurrency` block: `{"name":"Ghost","symbol":"GST","decimals":18}`.
- [ ] Start 1 bootnode + 1 validator; verify block production (`eth_blockNumber` increasing).
- [ ] Add remaining validators; verify finality/consensus health (Clique PoA: check `clique_status`).
- [ ] Verify JSON-RPC:
  - [ ] Balances shown as GST in UI/explorer tooling (not ETH).
  - [ ] Gas/fees labeled GST.
- [ ] Re-deploy L1 contracts (OptimisticRollup, GhostConstitution, GhostNFT, etc.).
- [ ] Update `contracts/deployments/ghostl2/l1.json` with new addresses.
- [ ] Run `scripts/gst-symbol-gate.sh` — gate must pass.
- [ ] Freeze L1 genesis + config hash (commit SHA to repo).

---

## Phase 4 — L2 (GhostL2) Regenesis (OP Stack)

- [ ] Create L2 genesis anchored to new L1 (`chainId = 901`).
- [ ] Set `nativeCurrency`: `{"name":"Ghost","symbol":"GST","decimals":18}`.
- [ ] Deploy L2 system contracts and OP Stack predeploys (fee vaults, gas oracle, messenger).
- [ ] Start `op-geth` + `op-node` + sequencer + batcher (+ proposer if used).
- [ ] Confirm:
  - [ ] L2 produces blocks.
  - [ ] Deposits/withdrawals work in test mode.
  - [ ] Fee vaults collect GST.
- [ ] Re-deploy application contracts:
  - `GhostGasTokenL2` (1B GST supply)
  - `GhostTokenL2` (burn-only)
  - `GuardPolicy`, `L2L3Bridge`, `GhostNFT`, finality oracles
- [ ] Update `contracts/deployments/ghostl2/l2.json` with new addresses.
- [ ] Run `scripts/gst-symbol-gate.sh` — gate must pass.
- [ ] Freeze L2 `rollup.json` + genesis hash (commit to repo).

---

## Phase 5 — L3 (GhostL3) Regenesis (OP Stack)

- [ ] Create L3 genesis anchored to L2 (`chainId = 903`). Routing: L3 → L2 → L1 only.
- [ ] Set `nativeCurrency`: `{"name":"Ghost","symbol":"GST","decimals":18}`.
- [ ] Start `op-geth` + `op-node` + sequencer + batcher (+ proposer if used).
- [ ] Confirm:
  - [ ] L3 produces blocks.
  - [ ] L3 → L2 messaging works.
  - [ ] No direct L3 → L1 bypass (verify bridge routing in `L3Inbox`).
- [ ] Re-deploy application contracts:
  - `GhostGasTokenL3` (1B GST supply)
  - `L3Inbox`, `L3BridgedTokenFactory`, `GhostNFT`
- [ ] Update `contracts/deployments/ghostl2/l3.json` with new addresses.
- [ ] Run `scripts/gst-symbol-gate.sh` — gate must pass.
- [ ] Freeze L3 `rollup.json` + genesis hash (commit to repo).

---

## Phase 6 — Constitutional Branding Enforcement (On-Chain)

- [ ] Deploy `GhostIdentityConstitution` on L1 with governor = governance multisig.
- [ ] Record `IDENTITY_HASH` from deployment: `cast call <addr> "IDENTITY_HASH()"`.
- [ ] Pin `IDENTITY_HASH` in release notes and `contracts/deployments/ghostl2/l1.json`.
- [ ] Register core system contracts via `setSystemContract(key, addr)`.
- [ ] Run `scripts/brand-audit.sh` — must emit `✅ Branding audit PASSED.`

---

## Phase 7 — Explorer + Wallet + UI

- [ ] Explorer coin config: `name=Ghost`, `symbol=GST`, `decimals=18`.
- [ ] Wallet chain metadata updated for all three chains (L1/L2/L3).
  - L1: chainId=14000101, rpcUrl=:18545, nativeCurrency={name:"Ghost",symbol:"GST",decimals:18}
  - L2: chainId=901, rpcUrl=:29547
  - L3: chainId=903, rpcUrl=:39545
- [ ] Next.js UI shows GST everywhere (except bridge screens).
- [ ] Verify no ETH text in production UI builds, Grafana dashboards, or alert messages.

---

## Phase 8 — Observability + SLOs

- [ ] Prometheus metrics use `*_gst` labels: `revenue_gst`, `burn_gst`, `fees_gst`, `validator_rewards_gst`.
- [ ] Grafana dashboards updated to GST naming.
- [ ] Alert message strings reference GST (not ETH).
- [ ] Run 24-hour soak test on devnet/testnet with realistic load.
- [ ] Confirm no errors or unexpected behavior in ghost-guard, ghost-relayer, proposer, challenger.

---

## Phase 9 — Release & Governance Lock

- [ ] Tag release: `git tag regenesis-vX.Y.Z-$(date +%Y%m%d)` with genesis hashes in tag message.
- [ ] Store genesis + rollup configs in immutable artifact registry.
- [ ] Activate `GhostIdentityConstitution` gate on-chain.
- [ ] Enable `scripts/gst-symbol-gate.sh` and `scripts/brand-audit.sh` in CI on protected branches.
- [ ] File regenesis completion report and update `PLAN.md`.

---

## Final Acceptance Tests

- [ ] `scripts/gst-symbol-gate.sh` exits 0. ✅
- [ ] `scripts/brand-audit.sh` exits 0. ✅
- [ ] `forge build --skip test` exits 0 with no errors. ✅
- [ ] All nodes (L1/L2/L3) produce blocks and report GST as native unit.
- [ ] Explorers and wallet UI consistently display Ghost/GST.
- [ ] Bridge UIs/adapters are the ONLY place external naming (ETH, Ether) appears.
- [ ] `GhostIdentityConstitution.IDENTITY_HASH` matches pinned value in release notes.
