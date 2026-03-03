# GhostBrain ACG — Operations Runbook

**System:** GhostBrain Core: Autonomous Code Guardian (ACG)  
**Version:** 1.0.0  
**Last Updated:** 2026-03-03

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Quick Reference](#2-architecture-quick-reference)
3. [Starting the ACG System](#3-starting-the-acg-system)
4. [Submitting a Change Proposal](#4-submitting-a-change-proposal)
5. [Gate Reference](#5-gate-reference)
6. [Secret Hygiene](#6-secret-hygiene)
7. [Routing Law](#7-routing-law)
8. [Rollback Procedures](#8-rollback-procedures)
9. [Emergency / Break Glass](#9-emergency--break-glass)
10. [Monitoring & Alerts](#10-monitoring--alerts)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. System Overview

The Autonomous Code Guardian (ACG) is a governed pipeline inside GhostBrain Core that
autonomously writes, upgrades, debugs, and deploys code changes — while enforcing
mandatory safety gates at every step.

**What it can do autonomously:**
- Dependency upgrades (with audit pass)
- Bug fixes (with failing test first)
- Minor feature additions
- Refactors within blast-radius cap
- Security patch application

**What always requires human PR review:**
- Changes to contracts/src/ (all Solidity)
- Changes to .github/workflows/ (CI)
- Changes to routing-law or policy gates themselves
- Any "critical" risk-level proposal

**What the ACG will never do:**
- Push directly to `main` (always via PR)
- Skip a gate (hard-coded, not configurable)
- Store or log secrets
- Route GhostL3 directly to GhostChain L1

---

## 2. Architecture Quick Reference

```
User / Sentinel / Scheduler
        │
        ▼
  POST /acg/proposals
        │
        ▼
  ACGPipeline.run()
        │
        ├─► PlannerAgent     → goal → PatchPlan (diffs + commands)
        │
        ├─► ExecutorAgent    → apply diffs, build, commit
        │
        ├─► Gate Runner ─────────────────────────────────────────
        │       ├─ routing-law    (HARD BLOCK on violation)
        │       ├─ build          (tsc, forge)
        │       ├─ code-quality   (eslint, prettier)
        │       ├─ test           (vitest, forge fuzz)
        │       ├─ security       (pnpm audit, gitleaks, semgrep, slither)
        │       ├─ supply-chain   (lockfile, SBOM, image pins)
        │       └─ change-risk    (risk level vs. rollout strategy)
        │
        ├─► DebuggerAgent    → on gate fail: red test → fix → retry
        │
        ├─► AuditorAgent     → final security sign-off
        │
        ├─► QAAgent          → final test pass
        │
        └─► ReleaseAgent     → SBOM, provenance, push branch, open PR
                │
                ▼
          SentinelAgent (async) → watch SLOs → auto-rollback or hotfix proposal
```

**NATS subjects:**
- `acg.proposal.created` — new proposal
- `acg.gate.result` — gate completion
- `acg.sentinel.observation` — post-deploy observation
- `acg.hotfix.proposal` — escalated hotfix request

---

## 3. Starting the ACG System

### Full GhostBrain stack (includes ACG agents):

```bash
cp stack.env.example stack.env
# Edit stack.env — set ACG_GITHUB_TOKEN via Vault (see §6)

docker compose -f docker-compose.ghostbrain.yml --env-file stack.env up -d
```

### Run database migration:

```bash
docker exec -i ghostbrain-postgres psql -U ghostbrain ghostbrain \
  < services/ghostbrain-core/schemas/acg-migration.sql
```

### Verify ACG is up:

```bash
curl http://localhost:7900/acg/status
# Expected: {"service":"ghostbrain-acg","healthy":true,...}
```

### Check agent containers:

```bash
docker compose -f docker-compose.ghostbrain.yml ps
# acg-planner, acg-auditor, acg-sentinel should be "running"
```

---

## 4. Submitting a Change Proposal

### Via HTTP API:

```bash
curl -X POST http://localhost:7900/acg/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "goal": "Upgrade pnpm dependencies to latest patch versions",
    "scope": ["services/ghostbrain-core"],
    "triggeredBy": "user"
  }'
```

Response:
```json
{
  "proposalId": "a1b2c3d4-...",
  "status": "planning",
  "riskLevel": "low",
  "rolloutStrategy": "none",
  "_links": { "self": "/acg/proposals/a1b2c3d4-..." }
}
```

### Monitor progress:

```bash
# Poll proposal status
curl http://localhost:7900/acg/proposals/a1b2c3d4-...

# Check gate results
curl http://localhost:7900/acg/proposals/a1b2c3d4-.../gates

# Watch NATS events
docker exec -it ghostbrain-nats nats sub "acg.>"
```

### Retry a failed proposal:

```bash
curl -X POST http://localhost:7900/acg/proposals/a1b2c3d4-.../retry
```

---

## 5. Gate Reference

| Gate | When | Hard Block? | Tool(s) | Notes |
|------|------|-------------|---------|-------|
| routing-law | Always | ✅ Yes | Custom scanner | L3→L1 direct = CRITICAL |
| build | Always | ✅ Yes | tsc, forge | Must compile cleanly |
| code-quality | Always | ⚠️ Warn | eslint, prettier | Warnings-as-errors mode |
| test | Always | ✅ Yes | vitest, forge fuzz | Coverage floor: 80% |
| security | Always | ✅ Yes (C/H) | pnpm audit, gitleaks, semgrep, slither | CRITICAL or HIGH = block |
| supply-chain | Always | ⚠️ Partial | syft, trivy | :latest images = warn |
| change-risk | Always | ✅ Yes (critical) | Internal | High risk without canary = block |
| contract-scan | Solidity changes | ✅ Yes | slither, echidna | High/Critical findings = block |

### To add a new gate:

1. Add `GateKind` entry to `src/acg/types.ts`
2. Implement gate function in `src/acg/gate-runner.ts`
3. Add gate to `runAllGates()` sequence
4. Add corresponding job to `.github/workflows/acg-guardian.yml`
5. Document in `policy/security-gates.yml` or `policy/quality-gates.yml`

---

## 6. Secret Hygiene

**Rule:** No secret ever appears in code, logs, or commit messages.

### Vault injection flow:

```
Vault (VAULT_ADDR) ──► ghostbrain-core (VAULT_ROLE_ID) ──► ACG_GITHUB_TOKEN (runtime)
```

### Setting ACG_GITHUB_TOKEN via Vault:

```bash
# Store token in Vault (never in stack.env)
vault kv put secret/ghostbrain/acg \
  github_token="ghp_xxxx"

# Reference in docker-compose via Vault agent injector or sidecar
# See services/ai-vault/README.md for injection patterns
```

### REDACT list (logger.ts):

If adding new secret-bearing env vars, update the `REDACT` list in
`services/ghostbrain-core/src/logger.ts`. The logger automatically redacts
fields named in the list before emitting any log line.

### Pre-commit hooks:

Install gitleaks pre-commit to catch leaks before they hit CI:

```bash
# Install gitleaks
brew install gitleaks  # or: https://github.com/gitleaks/gitleaks

# Create .githooks/pre-commit
cat > .githooks/pre-commit << 'EOF'
#!/bin/sh
gitleaks protect --staged --exit-code 1
EOF
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

---

## 7. Routing Law

```
GhostL3  ────►  GhostL2  ────►  GhostChain L1
  (L3)           (L2)               (L1)

✓  L3 → L2   (legal)
✓  L2 → L1   (legal)
✓  L2 → L3   (legal, reverse)
✓  L1 → L2   (legal, reverse)
✗  L3 → L1   FORBIDDEN — always blocked by routing-law gate
```

### Enforcement points:

1. **CI:** `acg-guardian.yml` job `routing-law` — scans every diff
2. **Runtime:** `src/policy/routing-law.ts` — `isRoutingLegal()` called by gatekeeper
3. **On-chain:** `GhostContractRegistry` at `GHOSTAI_REGISTRY_ADDRESS`

### If a routing violation is found in production:

See §9 Emergency procedures.

---

## 8. Rollback Procedures

### Rollback a deployed proposal (standard):

Every ACG PR describes its rollback steps in the PR body under **Rollback Plan**.
Standard pattern:

```bash
# 1. Revert the PR merge commit
git revert -m 1 <merge-commit-sha>
git push origin main

# 2. Re-deploy the previous artifact
docker compose -f docker-compose.ghostbrain.yml pull ghostbrain-core
docker compose -f docker-compose.ghostbrain.yml up -d ghostbrain-core

# 3. Verify rollback
curl http://localhost:7900/healthz
```

### Auto-rollback (via Sentinel):

When `SentinelAgent` detects `error_rate > 5× baseline`, it:
1. Publishes `acg.hotfix.proposal` with `triggeredByRef = original_proposalId`
2. GhostBrain brain loop picks this up and starts a new hotfix pipeline
3. Hotfix pipeline has reduced blast radius cap and forced `critical` risk level

To disable auto-rollback temporarily (GUARDIAN_ROLE only):

```bash
# Call GhostUpgradeGovernor.emergencyPause() on-chain
# This suspends the sentinel's rollback authority
cast send $GHOSTAI_GOVERNOR_ADDRESS "emergencyPause(string)" "ACG sentinel paused: manual override" \
  --private-key $GUARDIAN_PRIVATE_KEY \
  --rpc-url $L2_RPC_URL
```

---

## 9. Emergency / Break Glass

### Scenario: Routing law bypass in production

1. Call `GhostUpgradeGovernor.emergencyPause(reason)` with GUARDIAN_ROLE key
2. Block all ACG proposals via: `curl -X POST http://localhost:7900/acg/pause` (if endpoint enabled)
3. Identify the bypassing contract/service and isolate it (docker stop or firewall rule)
4. File post-mortem: `docs/postmortems/$(date +%Y-%m-%d)-routing-bypass.md`
5. Do NOT resume until `liftQuarantine` is approved by governance quorum

### Scenario: Critical Slither finding post-deploy

1. Pause affected contract via `GhostUpgradeGovernor.emergencyPause(reason)`
2. Submit emergency Change Proposal via ACG with `riskLevel: critical`
3. ACG will enforce `blue-green` rollout and full audit suite
4. Apply fix only after all gates pass
5. File post-mortem in `docs/postmortems/`

### Scenario: Secret exposed in commit

1. IMMEDIATELY rotate the exposed credential
2. Run: `git filter-branch` or `git-filter-repo` to remove from history
3. Force-push cleaned history (coordinate with team)
4. Update REDACT list in `logger.ts` to catch similar patterns
5. File security incident report

---

## 10. Monitoring & Alerts

### Key metrics (Prometheus):

| Metric | Alert threshold |
|--------|----------------|
| `acg_proposals_total{status="failed"}` | > 3 in 1h |
| `acg_gate_duration_seconds{gate="security"}` | > 600s |
| `acg_sentinel_rollbacks_total` | > 0 (always alert) |
| `acg_security_findings_total{severity="critical"}` | > 0 (immediate page) |

### Dashboards:

- Grafana → GhostBrain ACG dashboard (import `grafana/dashboards/acg.json`)

### NATS monitoring:

```bash
# Watch all ACG events
docker exec -it ghostbrain-nats nats sub "acg.>"

# Count pending proposals
docker exec -it ghostbrain-nats nats stream info acg-proposals
```

---

## 11. Troubleshooting

### Problem: Proposal stuck in "planning"

```bash
# Check planner agent logs
docker logs acg-planner --tail=100

# Check NATS for stuck messages
docker exec -it ghostbrain-nats nats sub "acg.patch.request"
```

### Problem: Security gate crashes (tool not installed)

Semgrep, gitleaks, trivy, slither are optional in the Docker image — they emit
warnings if absent rather than hard-failing. To install in the container:

```bash
docker exec -it acg-auditor sh -c "pip install slither-analyzer semgrep && pip install"
```

For production: add tools to `services/ghostbrain-core/Dockerfile` in the build stage.

### Problem: GitHub PR not created

Check ACG_GITHUB_TOKEN is set and has `repo` + `pull_requests: write` scope:

```bash
docker exec -it ghostbrain-core env | grep ACG_GITHUB
# Token should NOT be logged — if it appears, update REDACT list immediately
```

### Problem: Coverage gate fails

```bash
# Check current coverage per package
docker exec -it acg-planner sh -c "cd /workspace && pnpm --filter ghostbrain-core test --coverage"

# Adjust floor per-service in policy/quality-gates.yml → per_package section
```

### Problem: "L3→L1 routing violation" on a false positive

Review the routing-law gate detection patterns in `policy/routing-law.yml`.
If a pattern is generating false positives, open an ACG proposal to update the
detection regex (this itself goes through the full gate pipeline).
