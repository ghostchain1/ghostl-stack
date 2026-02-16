#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ghost/ghostl-stack"
GC_DIR="${ROOT_DIR}/tools/ghostcontrol"
DB_PATH="${GC_DIR}/incidents/incidents.db"
LOG_DIR="${GC_DIR}/evidence/logs"

EVENT_REASON="${1:-manual_event}"
VM_TARGET="${VM_TARGET:-devnet}"
RISK_BUDGET="${RISK_BUDGET:-LOW}"
GOVERNANCE_MODE="${GOVERNANCE_MODE:-DEVNET}"
COMPOSE_FILE="${COMPOSE_FILE:-tools/ghostcontrol/infra/compose/docker-compose.yml}"
GHOST_DOCKER_GROUP="${GHOST_DOCKER_GROUP:-ghost}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required but not found" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but not found" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not found" >&2
  exit 1
fi

NEXT_ITERATION="${ITERATION_OVERRIDE:-$(sqlite3 "${DB_PATH}" "SELECT COALESCE(MAX(iteration), 0) + 1 FROM checkpoints;")}"
if [[ ! "${NEXT_ITERATION}" =~ ^[0-9]+$ ]]; then
  echo "Failed to resolve next iteration number: ${NEXT_ITERATION}" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"

EVENT_CONTEXT_LOG="${LOG_DIR}/iteration-${NEXT_ITERATION}-event-context.json"
cat > "${EVENT_CONTEXT_LOG}" <<EOF
{
  "iteration": ${NEXT_ITERATION},
  "event_reason": "${EVENT_REASON}",
  "vm_target": "${VM_TARGET}",
  "risk_budget": "${RISK_BUDGET}",
  "governance_mode": "${GOVERNANCE_MODE}",
  "compose_file": "${COMPOSE_FILE}",
  "docker_group": "${GHOST_DOCKER_GROUP}",
  "generated_at_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

cd "${GC_DIR}"
npx tsc -p tsconfig.ghostloop.json > "evidence/logs/iteration-${NEXT_ITERATION}-typecheck.log"
node --test --experimental-strip-types tests/*.test.ts > "evidence/logs/iteration-${NEXT_ITERATION}-tests.log"
bash security/trivy/scan-images.sh > "evidence/logs/iteration-${NEXT_ITERATION}-trivy-images.log"
bash security/trivy/scan-secrets.sh > "evidence/logs/iteration-${NEXT_ITERATION}-trivy-secrets.log"

cd "${ROOT_DIR}"
GHOST_DOCKER_GROUP="${GHOST_DOCKER_GROUP}" node --experimental-strip-types \
  tools/ghostcontrol/orchestrator/ghostloop.ts \
  --iteration "${NEXT_ITERATION}" \
  --vm "${VM_TARGET}" \
  --compose "${COMPOSE_FILE}" \
  --risk "${RISK_BUDGET}" \
  --governance "${GOVERNANCE_MODE}" \
  > "tools/ghostcontrol/evidence/logs/iteration-${NEXT_ITERATION}-ghostloop-result.json"

GHOST_ITERATION="${NEXT_ITERATION}" node --experimental-strip-types --input-type=module <<'EOF'
import { writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { packageEvidence } from "./tools/ghostcontrol/evidence/packager.ts";

const iteration = Number(process.env.GHOST_ITERATION ?? "0");
if (!Number.isFinite(iteration) || iteration <= 0) {
  throw new Error(`invalid iteration: ${process.env.GHOST_ITERATION ?? ""}`);
}

const dbPath = "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/incidents.db";
const logDir = "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/logs";
const db = new DatabaseSync(dbPath);

try {
  const open = db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE status='open'").get();
  const cp = db
    .prepare("SELECT id, iteration, decision, created_at FROM checkpoints ORDER BY id DESC LIMIT 3")
    .all();
  const patch = db
    .prepare("SELECT id, incident_id, status, created_at FROM patches ORDER BY id DESC LIMIT 3")
    .all();
  const inc = db
    .prepare("SELECT id, status, summary, created_at FROM incidents ORDER BY id DESC LIMIT 3")
    .all();

  const rankingPath = `${logDir}/iteration-${iteration}-ranking.json`;
  const dbStatusPath = `${logDir}/iteration-${iteration}-db-status.json`;

  await writeFile(
    rankingPath,
    JSON.stringify({ openIncidentCount: Number(open?.c ?? 0), ranked: [] }, null, 2),
    "utf8",
  );

  await writeFile(
    dbStatusPath,
    JSON.stringify({ open, cp, patch, inc }, null, 2),
    "utf8",
  );

  const packaged = await packageEvidence({
    dbPath,
    artifacts: [
      {
        type: "event_context",
        uri: `${logDir}/iteration-${iteration}-event-context.json`,
        notes: "Event trigger context",
      },
      {
        type: "unit_test_log",
        uri: `${logDir}/iteration-${iteration}-tests.log`,
        notes: "Node test suite output",
      },
      {
        type: "typecheck_log",
        uri: `${logDir}/iteration-${iteration}-typecheck.log`,
        notes: "TypeScript ghostloop typecheck output",
      },
      {
        type: "scan_log",
        uri: `${logDir}/iteration-${iteration}-trivy-images.log`,
        notes: "Trivy image scan gate execution log",
      },
      {
        type: "scan_log",
        uri: `${logDir}/iteration-${iteration}-trivy-secrets.log`,
        notes: "Trivy secret scan gate execution log",
      },
      {
        type: "scan_summary",
        uri: "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/ghostcontrol-image-gate-summary.json",
        notes: "Trivy image gate summary json",
      },
      {
        type: "scan_summary",
        uri: "/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/scans/ghostcontrol-secret-gate-summary.json",
        notes: "Trivy secret gate summary json",
      },
      {
        type: "runtime_inspection",
        uri: `${logDir}/iteration-${iteration}-runtime-inspection.log`,
        notes: "Runtime invariant inspection log",
      },
      {
        type: "ranking",
        uri: rankingPath,
        notes: "Patch ranking snapshot",
      },
      {
        type: "checkpoint_result",
        uri: `${logDir}/iteration-${iteration}-ghostloop-result.json`,
        notes: "Ghostloop iteration output",
      },
      {
        type: "db_snapshot",
        uri: dbStatusPath,
        notes: "Incident/patch/checkpoint DB snapshot",
      },
    ],
  });

  await writeFile(
    `${logDir}/iteration-${iteration}-package-evidence.json`,
    JSON.stringify(packaged, null, 2),
    "utf8",
  );

  const latest = db
    .prepare("SELECT id, patch_id, type, uri, sha256, created_at FROM evidence ORDER BY id DESC LIMIT 12")
    .all();
  await writeFile(
    `${logDir}/iteration-${iteration}-evidence-latest.json`,
    JSON.stringify(latest, null, 2),
    "utf8",
  );
} finally {
  db.close();
}
EOF

echo "event_cycle_complete iteration=${NEXT_ITERATION}"
echo "event_context_log=tools/ghostcontrol/evidence/logs/iteration-${NEXT_ITERATION}-event-context.json"
echo "checkpoint_log=tools/ghostcontrol/evidence/logs/iteration-${NEXT_ITERATION}-ghostloop-result.json"
echo "package_log=tools/ghostcontrol/evidence/logs/iteration-${NEXT_ITERATION}-package-evidence.json"
