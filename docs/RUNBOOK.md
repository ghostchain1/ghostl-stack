# Liquidity Gravity Engine (LGE) — Operator Runbook (Dev/MVP)

This runbook covers the dev deployment and operational workflow for the Liquidity Gravity Engine.

## Prereqs

- Node.js 22.x
- Docker + Docker Compose
- Foundry (`forge`, `anvil`) for local chain/testing

## Dev bring-up (Golden Path)

1. Start the LGE stack (dev):
   - `bash scripts/up-liquidity-gravity.sh`
   - Optional (ZK prover profile): `bash scripts/up-liquidity-gravity.sh --zk`
2. Deploy contracts to the L1 dev chain:
   - `cd contracts && RPC_L1=http://localhost:18545 L1_CHAIN_ID=14000101 DEPLOYER_PRIVATE_KEY=<anvil-key> npx hardhat run --network anvil scripts/deploy_liquidity_gravity.ts`
3. Update `services/stack.env` with the printed `LGE_*_ADDRESS` values and restart the router:
   - `docker compose -f infra/docker/liquidity-gravity/docker-compose.yml restart liquidity-router`
4. Deposit native liquidity into the vault (dev):
   - `cd contracts && RPC_L1=http://localhost:18545 L1_CHAIN_ID=14000101 DEPLOYER_PRIVATE_KEY=<anvil-key> LGE_VAULT_ADDRESS=<vault> LGE_DEPOSIT_GST=10 npx hardhat run --network anvil scripts/lge_demo_deposit_native.ts`
5. Open dashboards:
   - Grafana and Prometheus endpoints printed by the compose stack.

## Production Golden Path (Checklist)

1. **Governance**
   - Deploy LGE contracts with `governor`/`timelock` set to the L1 executor contracts (no EOAs as governance in production).
2. **Configuration via proposals**
   - Generate proposal artifacts with `tools/liquidityctl/src/cli.ts` and **review JSON + calldata + Markdown** before submission:
     - adapters (add/enable/pause)
     - caps and settlement intervals
     - relayer set and `minRelayers >= 2`
     - RewardRouter splits + DEX reinjection config (timelocked)
     - BridgeEscrow wiring (if enabled)
3. **Secrets**
   - Store `LGE_OPERATOR_PRIVATE_KEY` and `LGE_RELAYER_PRIVATE_KEYS` in Vault (or Docker secrets in dev).
   - Set `LGE_VAULT_PATH` and rotate keys on a fixed schedule.
4. **Custody**
   - Prefer **bridge escrow custody** for principal:
     - Deploy `BridgeEscrow`, configure `StandardBridge` per adapter/chain, and enable `LoadBalancerVault` bridge custody per adapter.
     - For native principal bridging, configure `BridgeEscrow.wrappedNative` (canonical wrapped-native token) and set a remote wrapped-native mapping per adapter.
     - Fund and enforce operator bonds; configure slashing/pausing playbooks.
5. **Settlement proofs**
   - For ECDSA adapters: enforce strict settlement intervals and quorum thresholds.
   - For ZK adapters: configure `SettlementOracle.setZkVerifier(adapterId, verifier)` and only enable once the verifier/circuit is audited.
   - For ZK proof generation, run an audited prover pipeline and point the router/CLI at it (`LGE_ZK_PROVER_URL`).
6. **Router safety gates**
   - Keep `LGE_WRITE_ENABLED=0` until:
     - Foundry fuzz/invariant tests pass
     - Slither (and any additional analyzers) are green
     - container scans (Trivy) are green
     - dashboards + alerting are green
7. **RPC resilience**
   - Configure per-chain RPC allowlists and failover (`LGE_EXTERNAL_RPCS_JSON`) and set `LGE_RPC_TIMEOUT_MS`.

## Routine operations

- Check router + oracle status:
  - `node --experimental-strip-types tools/liquidityctl/src/cli.ts status`
- Pause/resume an adapter:
  - `node --experimental-strip-types tools/liquidityctl/src/cli.ts pause-adapter --adapter <id>`
  - `node --experimental-strip-types tools/liquidityctl/src/cli.ts resume-adapter --adapter <id>`
- Force settlement attempt:
  - `node --experimental-strip-types tools/liquidityctl/src/cli.ts force-settle --adapter <id> --dry-run`

## Emergency procedures

- **Missed settlement window**
  1. `CircuitBreaker.pauseAdapter(adapterId)` via governance executor (or emergency path if configured).
  2. Stop new deploys; attempt unwind on external chain if possible.
  3. Collect evidence (commitment hash, external receipts) and submit settlement.
  4. Consider slashing operator bond if fraud or negligence is established.

- **Relayer quorum failure**
  1. Rotate relayer set via governance and update threshold.
  2. Audit signature artifacts and router audit logs.

## Logs and evidence

- Router append-only audit logs:
  - `artifacts/audit/liquidity-router/`
- Attestation artifacts:
  - `artifacts/attestations/`
