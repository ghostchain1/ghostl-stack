# GhostContractAI — Autonomous Smart Contract AI Service

> Production-grade, low-memory, autonomous Solidity contract lifecycle manager integrated with **GhostBrain Core**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start (Local)](#quick-start-local)
3. [Docker Run](#docker-run)
4. [Environment Variables](#environment-variables)
5. [Job API Reference](#job-api-reference)
6. [Autonomous Agents](#autonomous-agents)
7. [UCB1 Learning Strategy](#ucb1-learning-strategy)
8. [Policy Enforcement](#policy-enforcement)
9. [Evidence Packs](#evidence-packs)
10. [GhostBrain Core Integration](#ghostbrain-core-integration)
11. [Governance Constraints](#governance-constraints)
12. [Runbook](#runbook)

---

## Architecture Overview

```
GhostBrain Core
      │  REST  (X-Ghostbrain-Secret)
      ▼
┌─────────────────────────────────────────────┐
│  GhostContractAI  (port 7610)               │
│                                             │
│  POST /v1/jobs  ──▶  Orchestrator           │
│                         │                   │
│               ┌─────────▼──────────┐        │
│               │  Policy Gate       │        │
│               │  Memory Monitor    │        │
│               │  Workspace Sandbox │        │
│               └─────────┬──────────┘        │
│                         │                   │
│            ┌────────────▼─────────────┐     │
│            │  Per-Job Agent Dispatch  │     │
│            │  ┌──────────────────┐    │     │
│            │  │ Planner          │    │     │
│            │  │ Creator          │    │     │
│            │  │ Fixer            │    │     │
│            │  │ Upgrader         │    │     │
│            │  │ Compiler         │    │     │
│            │  │ Auditor          │    │     │
│            │  │ Learner (UCB1)   │    │     │
│            │  └──────────────────┘    │     │
│            └──────────────────────────┘     │
│                                             │
│  SQLite (WAL)  ←─  Evidence Packs           │
│  Prometheus /metrics                        │
└─────────────────────────────────────────────┘
      │  forge/slither/rg  (subprocess)
      ▼
  contracts/  (mounted volume, rw)
```

---

## Quick Start (Local)

### Prerequisites

- Node.js ≥ 22.21.0
- Foundry (`forge` CLI) — https://book.getfoundry.sh/getting-started/installation
- Slither — `pip install slither-analyzer`
- ripgrep — `apt install ripgrep` or `brew install ripgrep`

### Install & Run

```bash
# From repo root
cd services/ghostcontract-ai

npm install

# Copy and edit environment
cp ../../stack.env.example .env.local
# Set at minimum: GHOSTBRAIN_SHARED_SECRET

# Start
bash scripts/run-local.sh
```

Service will be available at `http://localhost:7610`.

### Health Check

```bash
curl http://localhost:7610/health
# {"ok":true,"uptime":42}
```

---

## Docker Run

```bash
# From repo root
docker compose up ghostcontract-ai

# Or standalone
docker build -t ghostcontract-ai services/ghostcontract-ai/
docker run -it --rm \
  -p 7610:7610 \
  -v $(pwd)/contracts:/app/contracts:rw \
  -e GHOSTBRAIN_SHARED_SECRET=changeme \
  -e NODE_ENV=production \
  ghostcontract-ai
```

Resource limits are declared in `docker-compose.yml`:
- CPU: 1.0 core
- Memory: 1024 MB hard cap (OOM kills the process, not the container)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7610` | HTTP listen port |
| `NODE_ENV` | `development` | `development` disables auth if secret is empty |
| `GHOSTBRAIN_SHARED_SECRET` | _(empty)_ | Shared secret for `X-Ghostbrain-Secret` header auth |
| `GHOSTAI_DB_PATH` | `/var/lib/ghost-contract-ai/jobs.db` | SQLite database path |
| `GHOSTAI_MEMORY_SOFT_MB` | `512` | Soft RSS limit — logged but not killed |
| `GHOSTAI_MEMORY_HARD_MB` | `1024` | Hard RSS limit — process exits with code 1 |
| `GHOSTAI_MAX_JOBS` | `1` | Concurrent job slots (increase with caution) |
| `GHOSTAI_FORGE_CONCURRENCY` | `1` | Parallel `forge` subprocess limit |
| `GHOSTAI_ALLOWED_ROOTS` | `/app/contracts` | Comma-separated paths the AI may read/write |
| `GHOSTAI_EVIDENCE_HMAC_SECRET` | _(empty)_ | If set, evidence packs are HMAC-SHA256 signed |
| `GHOSTAI_POLICY_FILE` | `config/policy.yml` | Policy YAML override path |
| `CONTRACTS_DIR` | `/app/contracts` | Foundry project root |
| `GHOSTAI_REGISTRY_ADDRESS` | _(empty)_ | `GhostContractRegistry` on-chain address |
| `GHOSTAI_GOVERNOR_ADDRESS` | _(empty)_ | `GhostUpgradeGovernor` on-chain address |
| `GHOSTAI_RISK_ORACLE_ADDRESS` | _(empty)_ | `GhostRiskOracle` on-chain address |

---

## Job API Reference

All endpoints require the header `X-Ghostbrain-Secret: <secret>` (omit in `development` mode).

### Create Job

```http
POST /v1/jobs
Content-Type: application/json
X-Ghostbrain-Secret: changeme

{
  "type": "CONTRACT_CREATE",
  "contractName": "MyToken",
  "template": "erc20",
  "parameters": {
    "name": "My Token",
    "symbol": "MTK",
    "decimals": 18
  },
  "timeoutMs": 120000,
  "priority": 5
}
```

**Job Types:**

| type | Description |
|---|---|
| `CONTRACT_CREATE` | Scaffold a new Solidity contract from template |
| `CONTRACT_FIX` | Diagnose and fix build/test failures |
| `CONTRACT_UPGRADE` | Propose UUPS upgrade with storage-safe migration |
| `CONTRACT_COMPILE` | `forge build` + artifact hash manifest |
| `CONTRACT_AUDIT` | `forge test` + Slither + risk score |

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "queueDepth": 1
}
```

---

### Get Job Status

```http
GET /v1/jobs/:id
X-Ghostbrain-Secret: changeme
```

**Response:**
```json
{
  "id": "550e8400-...",
  "type": "CONTRACT_AUDIT",
  "status": "completed",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "completedAt": "2025-01-01T00:02:30.000Z",
  "result": {
    "success": true,
    "summary": "Audit passed. Risk score: 12. No blockers.",
    "artefacts": ["forge-build.log", "slither.json"]
  }
}
```

Job statuses: `queued` → `running` → `completed` | `failed` | `cancelled`

---

### List Jobs

```http
GET /v1/jobs?status=completed&limit=20
X-Ghostbrain-Secret: changeme
```

Query params: `status`, `type`, `limit` (max 100)

---

### Get Evidence Pack

```http
GET /v1/jobs/:id/evidence
X-Ghostbrain-Secret: changeme
```

Returns the signed evidence pack JSON for the job. Evidence packs are stored in SQLite and optionally HMAC-signed.

---

### Cancel Job

```http
DELETE /v1/jobs/:id
X-Ghostbrain-Secret: changeme
```

Cancels a `queued` job. Running jobs cannot be cancelled (kill the container to abort).

---

### Example: Full Audit Flow

```bash
SECRET=changeme
BASE=http://localhost:7610

# 1. Submit audit
JOB=$(curl -s -X POST $BASE/v1/jobs \
  -H "X-Ghostbrain-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type":"CONTRACT_AUDIT","contractPath":"src/MyToken.sol","timeoutMs":180000}' \
  | jq -r .jobId)

echo "Job: $JOB"

# 2. Poll until done
while true; do
  STATUS=$(curl -s $BASE/v1/jobs/$JOB -H "X-Ghostbrain-Secret: $SECRET" | jq -r .status)
  echo "Status: $STATUS"
  [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]] && break
  sleep 5
done

# 3. Fetch evidence pack
curl -s $BASE/v1/jobs/$JOB/evidence -H "X-Ghostbrain-Secret: $SECRET" | jq .
```

---

## Autonomous Agents

### Planner

Discovers Solidity files via ripgrep, evaluates complexity, and produces a typed `Plan` object listing ordered `PlanStep` entries for other agents.

### Creator

Scaffolds new contracts from built-in templates:
- `erc20` — standard OpenZeppelin ERC-20
- `erc721` — standard OpenZeppelin ERC-721
- `uups_proxy` — UUPS upgradeable pattern
- `treasury` — multi-sig treasury with timelock

After creation, automatically runs Compiler → Auditor.

### Fixer

Diagnoses `forge build` and `forge test` failures by grepping error output with ripgrep. Verifies the fix compiles before returning success. Uses UCB1 to pick among fix strategies.

### Upgrader

Inspects existing contract storage layout via `forge inspect`, generates a typed `UpgradeProposal` with `StorageSlotDiff`, and scaffolds a migration script. Never applies the upgrade — emits a proposal for human governance review.

### Compiler

Runs `forge build`, collects all artifact file hashes, and returns a manifest.

### Auditor

Runs `forge build` + `forge test` + Slither full analysis, computes a deterministic risk score, and classifies findings as blockers or warnings.

### Learner

Records outcomes to SQLite and updates the UCB1 bandit for each job type × strategy combination. **Never modifies policy files or on-chain contracts** — read-only feedback loop.

---

## UCB1 Learning Strategy

The service uses a [UCB1 multi-armed bandit](https://en.wikipedia.org/wiki/Multi-armed_bandit) to select heuristic fix strategies per job type.

Each strategy accumulates a `totalReward` and `pullCount`. On each new job, the strategy with the highest UCB1 score is selected:

$$\text{UCB1}(i) = \bar{x}_i + \sqrt{\frac{2 \ln N}{n_i}}$$

Where $\bar{x}_i$ is the mean reward (success rate), $N$ is total pulls across all arms, and $n_i$ is pulls for arm $i$.

Strategies are namespaced by `jobType`. Initial exploration uses the constant `C = 1.41` (√2).

The bandit is persisted in the `strategy_bandit` SQLite table across restarts.

---

## Policy Enforcement

Policy is enforced in `src/core/policy.ts` before any agent runs. Rules are loaded from `config/policy.yml`.

Example `config/policy.yml`:

```yaml
allowedRoots:
  - /app/contracts

blockedPatterns:
  - "**/.env"
  - "**/node_modules/**"
  - "**/*.pem"

maxFileSizeBytes: 1048576      # 1 MB
maxTotalBytesPerJob: 52428800  # 50 MB
jobTimeoutMs: 300000           # 5 minutes

requireFoundryBuild: true
requireSlither: false   # set true in production
allowContractCreate: true
allowContractUpgrade: false   # requires governance review
```

**Any path outside `allowedRoots` raises a hard policy violation** — the agent is terminated with status `failed`.

---

## Evidence Packs

Each completed job emits an evidence pack stored in SQLite (table `evidence`) and retrievable via `GET /v1/jobs/:id/evidence`.

Evidence pack fields:

```json
{
  "jobId": "...",
  "jobType": "CONTRACT_AUDIT",
  "contractPaths": ["src/MyToken.sol"],
  "toolVersions": {
    "forge": "0.2.0",
    "slither": "0.10.0",
    "node": "22.21.0",
    "rg": "14.1.0"
  },
  "buildSuccess": true,
  "testPassed": true,
  "slitherFindings": 2,
  "slitherBlockers": 0,
  "riskScore": 12,
  "patchDiff": null,
  "touchedFiles": [
    { "path": "src/MyToken.sol", "sha256Before": "...", "sha256After": "...", "action": "read" }
  ],
  "generatedAt": "2025-01-01T00:02:30.000Z",
  "hmacSha256": "a3f9c2..."
}
```

If `GHOSTAI_EVIDENCE_HMAC_SECRET` is set, the `hmacSha256` field contains HMAC-SHA256 over the canonical JSON of all other fields. This allows Vault or an external auditor to verify authenticity.

---

## GhostBrain Core Integration

### From GhostBrain SDK

Install the typed client:

```bash
npm install @ghoststack/ghostbrain-sdk
```

```typescript
import { GhostContractAIClient } from "@ghoststack/ghostbrain-sdk";

const client = new GhostContractAIClient({
  baseUrl: "http://ghostcontract-ai:7610",
  secret: process.env.GHOSTBRAIN_SHARED_SECRET!,
});

// Submit an audit job and wait for completion
const result = await client.waitForJob(
  await client.createJob({
    type: "CONTRACT_AUDIT",
    contractPath: "src/Vault.sol",
    timeoutMs: 180_000,
  }),
);

console.log(result.status, result.result?.summary);
```

### Docker Compose Service Name

The service is registered as `ghostcontract-ai` in `docker-compose.yml`. Other containers reach it at `http://ghostcontract-ai:7610`.

### Prometheus Metrics

Metrics are exposed at `GET /metrics` in Prometheus text format. Key metrics:

| Metric | Type | Description |
|---|---|---|
| `ghostcontract_ai_jobs_total` | counter | Jobs submitted by type |
| `ghostcontract_ai_job_duration_seconds` | histogram | Job latency |
| `ghostcontract_ai_memory_rss_bytes` | gauge | Current RSS memory |
| `ghostcontract_ai_queue_depth` | gauge | Jobs waiting in queue |
| `ghostcontract_ai_ucb1_picks_total` | counter | Strategy picks by job type |

---

## Governance Constraints

Per `AGENTS.md`, the following hard rules apply:

1. **Routing Law**: L3 → L2 only; L2 → L1 (GhostChain root) only; L3 → L1 direct is **forbidden**. The service enforces this before any cross-chain message.

2. **Policy Gate**: All paths resolved by agents must match `allowedRoots`. The policy is never modified by the Learner agent.

3. **Upgrade Proposals**: The Upgrader agent **emits proposals only** — it never applies upgrades. Human governance approval is required.

4. **Emergency Pause**: If a routing law violation is detected in production, call `GhostUpgradeGovernor.emergencyPause(reason)` with `GUARDIAN_ROLE` and file a postmortem in `docs/postmortems/`.

5. **Secret Hygiene**: The logger redacts `GHOSTBRAIN_SHARED_SECRET`, `GHOSTAI_EVIDENCE_HMAC_SECRET`, and all other secret-bearing env vars automatically.

---

## Runbook

### Check Service Health

```bash
curl http://localhost:7610/health
curl http://localhost:7610/metrics | grep ghostcontract
```

### View Recent Jobs

```bash
curl -H "X-Ghostbrain-Secret: $SECRET" http://localhost:7610/v1/jobs?limit=10
```

### Inspect SQLite Directly

```bash
sqlite3 /var/lib/ghost-contract-ai/jobs.db \
  "SELECT id, type, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 20;"
```

### Check UCB1 Bandit State

```bash
sqlite3 /var/lib/ghost-contract-ai/jobs.db \
  "SELECT job_type, strategy, total_reward, pull_count FROM strategy_bandit ORDER BY job_type, pull_count DESC;"
```

### Reset a Stuck Job

```bash
sqlite3 /var/lib/ghost-contract-ai/jobs.db \
  "UPDATE jobs SET status='failed', error='manual reset', completed_at=datetime('now') WHERE id='<job-id>';"
```

### Memory Pressure

If the service is near the soft memory limit (`GHOSTAI_MEMORY_SOFT_MB`), reduce concurrent jobs:

```bash
docker compose up -d -e GHOSTAI_MAX_JOBS=1 ghostcontract-ai
```

If hard limit is hit, the process exits with code 1 and Docker restarts it (restart policy: `unless-stopped`).

### Rotate Shared Secret

1. Update `GHOSTBRAIN_SHARED_SECRET` in `stack.env` and all callers
2. `docker compose up -d ghostcontract-ai` — the service reads the env on startup
3. Verify: `curl -H "X-Ghostbrain-Secret: <newsecret>" http://localhost:7610/health`

### Enable Slither in Production

In `config/policy.yml`, set `requireSlither: true`. Ensure Slither is installed in the container:

```dockerfile
# In Dockerfile (already included):
RUN pip install slither-analyzer
```

Then redeploy: `docker compose up -d --build ghostcontract-ai`

---

*GhostStack — Autonomous Treasury & Contract Lifecycle Management*
