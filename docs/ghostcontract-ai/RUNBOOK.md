# GhostContractAI — Runbook

## Service Operations

### Start / Stop

```bash
# Docker Compose (recommended)
docker compose -f services/ghostcontract-ai/docker-compose.yml up -d
docker compose -f services/ghostcontract-ai/docker-compose.yml down

# Development (tsx hot-reload)
cd services/ghostcontract-ai
pnpm dev

# Production (compiled)
pnpm build && pnpm start
```

### Health Check

```bash
curl http://localhost:7610/health
# Expected: {"ok":true,"service":"ghostcontract-ai","env":"...","dryRun":true,"layers":{...}}
```

### Metrics

```bash
curl http://localhost:7610/metrics
# Prometheus text format
```

---

## Deploy Pipeline (Step-by-Step)

### 1. Compile + Test

```bash
curl -X POST http://localhost:7610/pipelines/compile-test \
  -H 'Content-Type: application/json' \
  -H 'X-Role: operator' \
  -d '{"profile": "default", "runInvariants": true}'

# Poll status
curl http://localhost:7610/reports/<pipelineId>
```

### 2. Security Audit

```bash
curl -X POST http://localhost:7610/pipelines/security-audit \
  -H 'Content-Type: application/json' \
  -H 'X-Role: auditor' \
  -d '{
    "contractPath": "src/ghostcontract-ai/GhostContractRegistry.sol",
    "contractName": "GhostContractRegistry"
  }'
```

### 3. Deploy (Dry-Run Default)

```bash
curl -X POST http://localhost:7610/pipelines/deploy \
  -H 'Content-Type: application/json' \
  -H 'X-Role: governor' \
  -d '{
    "chain": "L2",
    "contractName": "MyContract",
    "version": "1.0.0",
    "policyNamespace": "ghostcontract-ai.deploy.L2",
    "policyHash": "0xabc...",
    "dryRun": true
  }'
```

Set `"dryRun": false` **only** after:
- Foundry tests pass
- Slither clean
- Policy hash verified
- Governance approval obtained

### 4. Upgrade Proposal

```bash
curl -X POST http://localhost:7610/pipelines/upgrade \
  -H 'Content-Type: application/json' \
  -H 'X-Role: governor' \
  -d '{
    "chain": "L2",
    "proxyAddress": "0x...",
    "newImplementation": "0x...",
    "description": "Upgrade to v2 — routing law fix",
    "policyNamespace": "ghostcontract-ai.upgrade.L2",
    "policyHash": "0xabc...",
    "riskScore": 30
  }'
# Returns proposalId — execute via GhostUpgradeGovernor.execute() after governance
```

### 5. Rollback (Emergency)

```bash
curl -X POST http://localhost:7610/pipelines/rollback \
  -H 'Content-Type: application/json' \
  -H 'X-Role: governor' \
  -d '{
    "proxyAddress": "0x...",
    "chain": "L2",
    "previousImplementation": "0x...",
    "approvalRef": "gov-proposal-id-abc"
  }'
```

---

## On-Chain Contract Operations

### Deploy System Contracts

```bash
cd contracts

# Dry-run plan
GHOSTAI_ADMIN=0xYOUR_ADMIN_ADDR \
GHOSTAI_L1_CHAIN_ID=1 \
GHOSTAI_L2_CHAIN_ID=10 \
GHOSTAI_L3_CHAIN_ID=100 \
GHOSTAI_DEPLOY=false \
  forge script scripts/ghostcontract-ai/deploy_l1.s.sol \
  --rpc-url $L1_RPC_URL --verbosity 2

# Live deploy
GHOSTAI_DEPLOY=true \
  forge script scripts/ghostcontract-ai/deploy_l1.s.sol \
  --rpc-url $L1_RPC_URL --broadcast --verify
```

### Commit Policy Hash On-Chain

After any change to `constraints.yaml`:

```bash
# 1. Compute hash
HASH=$(sha256sum contracts/src/ghostcontract-ai/constraints.yaml | awk '{print $1}')

# 2. Commit via GhostPolicyGate (use cast or hardhat script)
cast send $GHOSTAI_POLICYGATE_ADDR \
  "commitPolicy(bytes32,bytes32,uint8,uint8,string)" \
  $(cast format-bytes32-string "ghostcontract-ai.constitutional") \
  0x$HASH 1 2 "Constitutional constraints v1" \
  --rpc-url $L1_RPC_URL --private-key $ADMIN_KEY
```

### Authorize AI Attestor Key

```bash
cast send $GHOSTAI_RISKORACLE_ADDR \
  "authorizeAttestor(address)" \
  $GHOSTAI_ATTESTOR_ADDRESS \
  --rpc-url $L1_RPC_URL --private-key $ADMIN_KEY
```

---

## Emergency Procedures

### Trigger Break Glass (Emergency Pause)

```bash
cast send $GHOSTAI_GOVERNOR_ADDR \
  "emergencyPause(string)" \
  "Critical vulnerability detected in MyContract" \
  --rpc-url $L1_RPC_URL --private-key $GUARDIAN_KEY
```

This blocks all `propose`, `approve`, and `execute` on the governor.

### Unpause (after postmortem)

```bash
# Prepare and upload postmortem evidence pack
# Then:
cast send $GHOSTAI_GOVERNOR_ADDR \
  "emergencyUnpause()" \
  --rpc-url $L1_RPC_URL --private-key $ADMIN_KEY
```

### Lift Quarantine (escalated approval)

```bash
cast send $GHOSTAI_GOVERNOR_ADDR \
  "liftQuarantine(bytes32)" \
  $PROPOSAL_ID \
  --rpc-url $L1_RPC_URL --private-key $ADMIN_KEY
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ROUTING_LAW_VIOLATION` 400 | Illegal chain combination in request | Use L3→L2 or L2→L1 only |
| `POLICY_GATE_FAILED` | policyHash missing or wrong | Recompute SHA256 of constraints.yaml |
| Pipeline stuck in `pending` | MAX_CONCURRENT_PIPELINES reached | Wait or restart service |
| `forge: not found` | Foundry not in image PATH | Service runs in fallback mode; install Foundry |
| `slither: not found` | Slither not installed | Audit pipeline returns mock report |
| `Vault unavailable` | VAULT_ADDR/TOKEN not set | Set env vars or use GHOSTAI_SIGNER_KEY for devnet |
