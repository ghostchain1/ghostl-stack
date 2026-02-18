#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ghost/ghostl-stack"
GC_DIR="${ROOT_DIR}/tools/ghostcontrol"
DB_PATH="${GC_DIR}/incidents/incidents.db"
LOG_DIR="${GC_DIR}/evidence/logs"
LOCK_FILE="${LOG_DIR}/run_event_cycle.lock"

EVENT_REASON="${1:-manual_event}"
VM_TARGET="${VM_TARGET:-devnet}"
RISK_BUDGET="${RISK_BUDGET:-LOW}"
GOVERNANCE_MODE="${GOVERNANCE_MODE:-DEVNET}"
COMPOSE_FILE="${COMPOSE_FILE:-tools/ghostcontrol/infra/compose/docker-compose.yml}"
GHOST_DOCKER_GROUP="${GHOST_DOCKER_GROUP:-ghost}"
GOVERNANCE_PROPOSAL_ID="${GOVERNANCE_PROPOSAL_ID:-}"
GOVERNANCE_GATE_FILE="${GOVERNANCE_GATE_FILE:-}"
L1_RPC="${L1_RPC:-${RPC_L1:-http://localhost:18545}}"
L2_RPC="${L2_RPC:-${RPC_L2:-http://localhost:29547}}"
L3_RPC="${L3_RPC:-${RPC_L3:-http://localhost:39545}}"
L1_CHAIN_ID="${L1_CHAIN_ID:-14000101}"
L2_CHAIN_ID="${L2_CHAIN_ID:-901}"
L3_CHAIN_ID="${L3_CHAIN_ID:-903}"
LOCK_WAIT_SECONDS="${LOCK_WAIT_SECONDS:-900}"
MIN_FREE_DISK_MB="${MIN_FREE_DISK_MB:-4096}"
DISK_PRESSURE_MODE="${DISK_PRESSURE_MODE:-warn}"
RPC_PREFLIGHT_MODE="${RPC_PREFLIGHT_MODE:-fail}"
RPC_PREFLIGHT_RETRIES="${RPC_PREFLIGHT_RETRIES:-3}"
RPC_PREFLIGHT_RETRY_DELAY_SECONDS="${RPC_PREFLIGHT_RETRY_DELAY_SECONDS:-3}"
RPC_AUTO_REMEDIATION_ENABLED="${RPC_AUTO_REMEDIATION_ENABLED:-true}"
RPC_AUTO_REMEDIATION_MAX_ATTEMPTS="${RPC_AUTO_REMEDIATION_MAX_ATTEMPTS:-1}"
RPC_AUTO_REMEDIATION_DELAY_SECONDS="${RPC_AUTO_REMEDIATION_DELAY_SECONDS:-5}"
RPC_AUTO_REMEDIATION_L1_CONTAINERS="${RPC_AUTO_REMEDIATION_L1_CONTAINERS-ghostchain-ghostchain-rpc-proxy-1,ghostchain-ghostchain-node1-1,ghostchain-ghostchain-node2-1,opstack-op-gate-l1-1}"
RPC_AUTO_REMEDIATION_L2_CONTAINERS="${RPC_AUTO_REMEDIATION_L2_CONTAINERS-opstack-rpc-forward-l2-18547-1,opstack-l2-geth-1,opstack-op-gate-1}"
RPC_AUTO_REMEDIATION_L3_CONTAINERS="${RPC_AUTO_REMEDIATION_L3_CONTAINERS-opstack-l3-geth-1}"

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

if ! command -v flock >/dev/null 2>&1; then
  echo "flock is required but not found" >&2
  exit 1
fi

if [[ ! "${L1_CHAIN_ID}" =~ ^[0-9]+$ ]]; then
  echo "L1_CHAIN_ID must be numeric: ${L1_CHAIN_ID}" >&2
  exit 1
fi

if [[ ! "${L2_CHAIN_ID}" =~ ^[0-9]+$ ]]; then
  echo "L2_CHAIN_ID must be numeric: ${L2_CHAIN_ID}" >&2
  exit 1
fi

if [[ ! "${L3_CHAIN_ID}" =~ ^[0-9]+$ ]]; then
  echo "L3_CHAIN_ID must be numeric: ${L3_CHAIN_ID}" >&2
  exit 1
fi

if [[ "${GOVERNANCE_MODE}" == "MAINNET" && -z "${GOVERNANCE_PROPOSAL_ID}" ]]; then
  echo "GOVERNANCE_PROPOSAL_ID is required when GOVERNANCE_MODE=MAINNET" >&2
  exit 1
fi

if [[ ! "${LOCK_WAIT_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "LOCK_WAIT_SECONDS must be numeric: ${LOCK_WAIT_SECONDS}" >&2
  exit 1
fi

if [[ ! "${MIN_FREE_DISK_MB}" =~ ^[0-9]+$ ]]; then
  echo "MIN_FREE_DISK_MB must be numeric: ${MIN_FREE_DISK_MB}" >&2
  exit 1
fi

if [[ "${DISK_PRESSURE_MODE}" != "warn" && "${DISK_PRESSURE_MODE}" != "fail" ]]; then
  echo "DISK_PRESSURE_MODE must be warn|fail: ${DISK_PRESSURE_MODE}" >&2
  exit 1
fi

if [[ "${RPC_PREFLIGHT_MODE}" != "warn" && "${RPC_PREFLIGHT_MODE}" != "fail" ]]; then
  echo "RPC_PREFLIGHT_MODE must be warn|fail: ${RPC_PREFLIGHT_MODE}" >&2
  exit 1
fi

if [[ ! "${RPC_PREFLIGHT_RETRIES}" =~ ^[0-9]+$ || "${RPC_PREFLIGHT_RETRIES}" -le 0 ]]; then
  echo "RPC_PREFLIGHT_RETRIES must be a positive integer: ${RPC_PREFLIGHT_RETRIES}" >&2
  exit 1
fi

if [[ ! "${RPC_PREFLIGHT_RETRY_DELAY_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "RPC_PREFLIGHT_RETRY_DELAY_SECONDS must be numeric: ${RPC_PREFLIGHT_RETRY_DELAY_SECONDS}" >&2
  exit 1
fi

if [[ "${RPC_AUTO_REMEDIATION_ENABLED}" != "true" && "${RPC_AUTO_REMEDIATION_ENABLED}" != "false" ]]; then
  echo "RPC_AUTO_REMEDIATION_ENABLED must be true|false: ${RPC_AUTO_REMEDIATION_ENABLED}" >&2
  exit 1
fi

if [[ ! "${RPC_AUTO_REMEDIATION_MAX_ATTEMPTS}" =~ ^[0-9]+$ ]]; then
  echo "RPC_AUTO_REMEDIATION_MAX_ATTEMPTS must be numeric: ${RPC_AUTO_REMEDIATION_MAX_ATTEMPTS}" >&2
  exit 1
fi

if [[ ! "${RPC_AUTO_REMEDIATION_DELAY_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "RPC_AUTO_REMEDIATION_DELAY_SECONDS must be numeric: ${RPC_AUTO_REMEDIATION_DELAY_SECONDS}" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"

RPC_PREFLIGHT_OK=true
RPC_PREFLIGHT_LOG_PATH=""
RPC_PREFLIGHT_PROBE_LOG_PATH=""
RPC_AUTO_REMEDIATION_ATTEMPTS="0"
RPC_AUTO_REMEDIATION_RECOVERED="false"
RPC_AUTO_REMEDIATION_LAST_LOG_PATH=""
RPC_AUTO_REMEDIATION_LAST_RUN_LOG_PATH=""
RPC_PREFLIGHT_MITIGATION_STATUS="not_triggered"
RPC_PREFLIGHT_MITIGATION_LOG_PATH=""
RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH=""

read_free_disk_mb() {
  local path="$1"
  local free_kb

  free_kb="$(df -Pk "${path}" | awk 'NR==2 {print $4}')" || true
  if [[ -z "${free_kb}" || ! "${free_kb}" =~ ^[0-9]+$ ]]; then
    echo "0"
    return
  fi

  echo "$((free_kb / 1024))"
}

timestamp_slug_utc() {
  printf "%s-%05d" "$(date -u +"%Y%m%dT%H%M%S%3NZ")" "${RANDOM}"
}

run_with_docker_access() {
  local command="$1"
  local socket_group=""
  local candidate_group=""

  if [[ -S /var/run/docker.sock ]] && command -v stat >/dev/null 2>&1; then
    socket_group="$(stat -c '%G' /var/run/docker.sock 2>/dev/null || true)"
  fi

  candidate_group="${DOCKER_SOCKET_GROUP:-${socket_group:-${GHOST_DOCKER_GROUP:-}}}"

  if command -v sg >/dev/null 2>&1 && command -v getent >/dev/null 2>&1 && [[ -n "${candidate_group}" ]] && getent group "${candidate_group}" >/dev/null 2>&1; then
    sg "${candidate_group}" -c "${command}"
    return
  fi

  if command -v sg >/dev/null 2>&1 && command -v getent >/dev/null 2>&1 && getent group docker >/dev/null 2>&1; then
    sg docker -c "${command}"
    return
  fi

  bash -lc "${command}"
}

run_rpc_preflight_probe() {
  local timestamp

  timestamp="$(timestamp_slug_utc)"
  RPC_PREFLIGHT_LOG_PATH="${LOG_DIR}/event-cycle-rpc-preflight-${timestamp}.json"
  RPC_PREFLIGHT_PROBE_LOG_PATH="${LOG_DIR}/event-cycle-rpc-preflight-${timestamp}-probe.log"

  if GHOST_RPC_PREFLIGHT_LOG_PATH="${RPC_PREFLIGHT_LOG_PATH}" \
    GHOST_RPC_PREFLIGHT_RETRIES="${RPC_PREFLIGHT_RETRIES}" \
    GHOST_RPC_PREFLIGHT_RETRY_DELAY_SECONDS="${RPC_PREFLIGHT_RETRY_DELAY_SECONDS}" \
    GHOST_RPC_L1="${L1_RPC}" \
    GHOST_RPC_L2="${L2_RPC}" \
    GHOST_RPC_L3="${L3_RPC}" \
    GHOST_CHAIN_ID_L1="${L1_CHAIN_ID}" \
    GHOST_CHAIN_ID_L2="${L2_CHAIN_ID}" \
    GHOST_CHAIN_ID_L3="${L3_CHAIN_ID}" \
    node --input-type=module >"${RPC_PREFLIGHT_PROBE_LOG_PATH}" 2>&1 <<'EOF'
import { writeFile } from "node:fs/promises";

const logPath = process.env.GHOST_RPC_PREFLIGHT_LOG_PATH ?? "";
const retriesRaw = Number.parseInt(process.env.GHOST_RPC_PREFLIGHT_RETRIES ?? "3", 10);
const retries = Number.isFinite(retriesRaw) && retriesRaw > 0 ? retriesRaw : 1;
const retryDelayRaw = Number.parseInt(
  process.env.GHOST_RPC_PREFLIGHT_RETRY_DELAY_SECONDS ?? "3",
  10,
);
const retryDelaySeconds = Number.isFinite(retryDelayRaw) && retryDelayRaw >= 0 ? retryDelayRaw : 0;
const retryDelayMs = retryDelaySeconds * 1000;
const timeoutMs = 5000;

const layers = [
  {
    layer: "l1",
    rpcUrl: process.env.GHOST_RPC_L1 ?? "",
    expectedChainIdDec: process.env.GHOST_CHAIN_ID_L1 ?? "0",
  },
  {
    layer: "l2",
    rpcUrl: process.env.GHOST_RPC_L2 ?? "",
    expectedChainIdDec: process.env.GHOST_CHAIN_ID_L2 ?? "0",
  },
  {
    layer: "l3",
    rpcUrl: process.env.GHOST_RPC_L3 ?? "",
    expectedChainIdDec: process.env.GHOST_CHAIN_ID_L3 ?? "0",
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toHexChainId(decString) {
  try {
    return `0x${BigInt(decString).toString(16).toLowerCase()}`;
  } catch {
    return null;
  }
}

async function probeLayer(layerConfig) {
  const expectedChainIdHex = toHexChainId(layerConfig.expectedChainIdDec);
  const attempts = [];

  if (!layerConfig.rpcUrl) {
    return {
      layer: layerConfig.layer,
      rpcUrl: layerConfig.rpcUrl,
      expectedChainIdDec: layerConfig.expectedChainIdDec,
      expectedChainIdHex: expectedChainIdHex ?? "invalid",
      observedChainIdHex: null,
      ok: false,
      failureReason: "missing_rpc_url",
      attempts: [
        {
          attempt: 1,
          ok: false,
          errorType: "missing_rpc_url",
          detail: "rpc_url_not_set",
          observedChainIdHex: null,
          timestampUtc: new Date().toISOString(),
        },
      ],
    };
  }

  if (!expectedChainIdHex) {
    return {
      layer: layerConfig.layer,
      rpcUrl: layerConfig.rpcUrl,
      expectedChainIdDec: layerConfig.expectedChainIdDec,
      expectedChainIdHex: "invalid",
      observedChainIdHex: null,
      ok: false,
      failureReason: "invalid_expected_chain_id",
      attempts: [
        {
          attempt: 1,
          ok: false,
          errorType: "invalid_expected_chain_id",
          detail: `value=${layerConfig.expectedChainIdDec}`,
          observedChainIdHex: null,
          timestampUtc: new Date().toISOString(),
        },
      ],
    };
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const timestampUtc = new Date().toISOString();
    const attemptRecord = {
      attempt,
      ok: false,
      errorType: "unknown_error",
      detail: "",
      observedChainIdHex: null,
      timestampUtc,
    };

    try {
      const response = await fetch(layerConfig.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: attempt,
          method: "eth_chainId",
          params: [],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        attemptRecord.errorType = "http_error";
        attemptRecord.detail = `status=${response.status}`;
      } else {
        const body = await response.json();
        const observedChainIdHex = typeof body?.result === "string"
          ? body.result.toLowerCase()
          : "";
        attemptRecord.observedChainIdHex = observedChainIdHex || null;

        if (!observedChainIdHex.startsWith("0x")) {
          attemptRecord.errorType = "parse_error";
          attemptRecord.detail = `result=${String(body?.result ?? "")}`;
        } else if (observedChainIdHex !== expectedChainIdHex) {
          attemptRecord.errorType = "chain_id_mismatch";
          attemptRecord.detail =
            `expected=${expectedChainIdHex} actual=${observedChainIdHex}`;
        } else {
          attemptRecord.ok = true;
          attemptRecord.errorType = "none";
          attemptRecord.detail = "ok";
          attempts.push(attemptRecord);
          return {
            layer: layerConfig.layer,
            rpcUrl: layerConfig.rpcUrl,
            expectedChainIdDec: layerConfig.expectedChainIdDec,
            expectedChainIdHex,
            observedChainIdHex,
            ok: true,
            failureReason: null,
            attempts,
          };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout/i.test(message)) {
        attemptRecord.errorType = "timeout";
      } else {
        attemptRecord.errorType = "fetch_error";
      }
      attemptRecord.detail = message;
    }

    attempts.push(attemptRecord);
    if (attempt < retries && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  const observedChainIdHex = attempts
    .map((attempt) => attempt.observedChainIdHex)
    .find((value) => typeof value === "string" && value.length > 0) ?? null;
  const failureReason = attempts[attempts.length - 1]?.errorType ?? "unknown_error";
  return {
    layer: layerConfig.layer,
    rpcUrl: layerConfig.rpcUrl,
    expectedChainIdDec: layerConfig.expectedChainIdDec,
    expectedChainIdHex,
    observedChainIdHex,
    ok: false,
    failureReason,
    attempts,
  };
}

const results = [];
for (const layer of layers) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await probeLayer(layer));
}
const failures = results
  .filter((entry) => !entry.ok)
  .map((entry) => `${entry.layer}:${entry.failureReason ?? "unknown_error"}`);
const payload = {
  type: "run_event_cycle_rpc_preflight",
  ok: failures.length === 0,
  retries,
  retryDelaySeconds,
  timeoutMs,
  generatedAtUtc: new Date().toISOString(),
  results,
  failures,
};

if (logPath) {
  await writeFile(logPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

process.stdout.write(
  `${JSON.stringify({
    status: "ok",
    ok: payload.ok,
    failures,
  })}\n`,
);

if (!payload.ok) {
  process.exit(1);
}
EOF
  then
    RPC_PREFLIGHT_OK=true
  else
    RPC_PREFLIGHT_OK=false
  fi

  if [[ ! -f "${RPC_PREFLIGHT_LOG_PATH}" ]]; then
    cat > "${RPC_PREFLIGHT_LOG_PATH}" <<EOF
{"type":"run_event_cycle_rpc_preflight","ok":${RPC_PREFLIGHT_OK},"generated_at_utc":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF
  fi

  echo "rpc_preflight_log=${RPC_PREFLIGHT_LOG_PATH}" >&2
  echo "rpc_preflight_probe_log=${RPC_PREFLIGHT_PROBE_LOG_PATH}" >&2
}

parse_rpc_preflight_failures() {
  if [[ -z "${RPC_PREFLIGHT_LOG_PATH}" || ! -f "${RPC_PREFLIGHT_LOG_PATH}" ]]; then
    return 0
  fi

  GHOST_RPC_PREFLIGHT_LOG_PATH="${RPC_PREFLIGHT_LOG_PATH}" \
    node --input-type=module <<'EOF'
import { readFileSync } from "node:fs";

const logPath = process.env.GHOST_RPC_PREFLIGHT_LOG_PATH ?? "";
if (!logPath) {
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(logPath, "utf8"));
} catch {
  process.exit(0);
}

const entries = Array.isArray(payload?.results) ? payload.results : [];
for (const entry of entries) {
  if (entry?.ok === true) continue;
  const layer = String(entry?.layer ?? "unknown");
  const rpcUrl = String(entry?.rpcUrl ?? "");
  const reason = String(entry?.failureReason ?? "unknown_error");
  let port = "";
  try {
    const parsed = new URL(rpcUrl);
    if (parsed.port) {
      port = parsed.port;
    } else if (parsed.protocol === "https:") {
      port = "443";
    } else if (parsed.protocol === "http:") {
      port = "80";
    }
  } catch {
    // Keep empty port when URL parsing fails.
  }
  process.stdout.write(`${layer}\t${port}\t${rpcUrl}\t${reason}\n`);
}
EOF
}

trim_ascii() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf "%s" "${value}"
}

csv_containers_for_rpc_layer() {
  local layer="$1"
  case "${layer}" in
    l1) printf "%s" "${RPC_AUTO_REMEDIATION_L1_CONTAINERS}" ;;
    l2) printf "%s" "${RPC_AUTO_REMEDIATION_L2_CONTAINERS}" ;;
    l3) printf "%s" "${RPC_AUTO_REMEDIATION_L3_CONTAINERS}" ;;
    *) printf "" ;;
  esac
}

run_rpc_auto_remediation_attempt() {
  local attempt="$1"
  local timestamp
  local summary_log
  local run_log
  local failure_tsv
  local restart_tsv
  local docker_ps_output
  local status
  local -a failure_lines=()
  local restart_count=0
  local restart_success_count=0
  local container_name

  timestamp="$(timestamp_slug_utc)"
  summary_log="${LOG_DIR}/event-cycle-rpc-remediation-${timestamp}-attempt-${attempt}.json"
  run_log="${LOG_DIR}/event-cycle-rpc-remediation-${timestamp}-attempt-${attempt}.log"
  failure_tsv="${LOG_DIR}/event-cycle-rpc-remediation-${timestamp}-attempt-${attempt}-failures.tsv"
  restart_tsv="${LOG_DIR}/event-cycle-rpc-remediation-${timestamp}-attempt-${attempt}-restarts.tsv"

  RPC_AUTO_REMEDIATION_LAST_LOG_PATH="${summary_log}"
  RPC_AUTO_REMEDIATION_LAST_RUN_LOG_PATH="${run_log}"

  : > "${run_log}"
  : > "${failure_tsv}"
  : > "${restart_tsv}"

  mapfile -t failure_lines < <(parse_rpc_preflight_failures || true)
  if [[ "${#failure_lines[@]}" -eq 0 ]]; then
    status="no_failures"
  else
    status="restart_skipped"
  fi

  docker_ps_output="$(run_with_docker_access "docker ps --format '{{.Names}} {{.Ports}}'" 2>>"${run_log}" || true)"
  if [[ -n "${docker_ps_output}" ]]; then
    printf "%s\n" "${docker_ps_output}" >> "${run_log}"
  fi

  declare -A selected_targets=()
  for failure_line in "${failure_lines[@]}"; do
    local layer
    local port
    local rpc_url
    local reason
    local fallback_csv
    local -a fallback_items=()
    local fallback_item
    local trimmed_item
    local found_from_port=0

    IFS=$'\t' read -r layer port rpc_url reason <<< "${failure_line}"
    printf "%s\t%s\t%s\t%s\n" "${layer}" "${port}" "${rpc_url}" "${reason}" >> "${failure_tsv}"

    if [[ "${port}" =~ ^[0-9]+$ ]] && [[ -n "${docker_ps_output}" ]]; then
      while IFS= read -r ps_line; do
        local container_name
        local port_summary
        [[ -z "${ps_line}" ]] && continue
        container_name="${ps_line%% *}"
        port_summary="${ps_line#* }"
        if [[ "${port_summary}" == *":${port}->"* ]]; then
          selected_targets["${container_name}"]=1
          found_from_port=1
        fi
      done <<< "${docker_ps_output}"
    fi

    if [[ "${found_from_port}" -eq 0 ]]; then
      fallback_csv="$(csv_containers_for_rpc_layer "${layer}")"
      IFS=',' read -r -a fallback_items <<< "${fallback_csv}"
      for fallback_item in "${fallback_items[@]}"; do
        trimmed_item="$(trim_ascii "${fallback_item}")"
        [[ -z "${trimmed_item}" ]] && continue
        selected_targets["${trimmed_item}"]=1
      done
    fi
  done

  for container_name in "${!selected_targets[@]}"; do
    local restart_cmd
    local restart_rc=0
    printf -v restart_cmd "docker restart %q" "${container_name}"
    restart_count=$((restart_count + 1))
    if run_with_docker_access "${restart_cmd}" >> "${run_log}" 2>&1; then
      restart_success_count=$((restart_success_count + 1))
      printf "%s\ttrue\t0\n" "${container_name}" >> "${restart_tsv}"
    else
      restart_rc=$?
      printf "%s\tfalse\t%s\n" "${container_name}" "${restart_rc}" >> "${restart_tsv}"
    fi
  done

  if [[ "${#failure_lines[@]}" -eq 0 ]]; then
    status="no_failures"
  elif [[ "${restart_count}" -eq 0 ]]; then
    status="no_targets"
  elif [[ "${restart_success_count}" -gt 0 ]]; then
    status="restart_attempted"
  else
    status="restart_failed"
  fi

  GHOST_RPC_REMEDIATION_SUMMARY_PATH="${summary_log}" \
    GHOST_RPC_REMEDIATION_STATUS="${status}" \
    GHOST_RPC_REMEDIATION_ATTEMPT="${attempt}" \
    GHOST_RPC_REMEDIATION_MAX_ATTEMPTS="${RPC_AUTO_REMEDIATION_MAX_ATTEMPTS}" \
    GHOST_RPC_REMEDIATION_SOURCE_PREFLIGHT_LOG="${RPC_PREFLIGHT_LOG_PATH}" \
    GHOST_RPC_REMEDIATION_RUN_LOG="${run_log}" \
    GHOST_RPC_REMEDIATION_FAILURES_TSV="${failure_tsv}" \
    GHOST_RPC_REMEDIATION_RESTARTS_TSV="${restart_tsv}" \
    GHOST_RPC_REMEDIATION_RESTART_COUNT="${restart_count}" \
    GHOST_RPC_REMEDIATION_RESTART_SUCCESS_COUNT="${restart_success_count}" \
    node --input-type=module <<'EOF'
import { readFile, writeFile } from "node:fs/promises";

function parseTsv(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

async function readMaybe(path) {
  if (!path) return "";
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

const summaryPath = process.env.GHOST_RPC_REMEDIATION_SUMMARY_PATH ?? "";
const status = process.env.GHOST_RPC_REMEDIATION_STATUS ?? "unknown";
const failuresRaw = await readMaybe(process.env.GHOST_RPC_REMEDIATION_FAILURES_TSV ?? "");
const restartsRaw = await readMaybe(process.env.GHOST_RPC_REMEDIATION_RESTARTS_TSV ?? "");

const failures = parseTsv(failuresRaw).map((fields) => ({
  layer: fields[0] ?? "",
  hostPort: fields[1] ?? "",
  rpcUrl: fields[2] ?? "",
  failureReason: fields[3] ?? "unknown_error",
}));

const restarts = parseTsv(restartsRaw).map((fields) => ({
  container: fields[0] ?? "",
  ok: (fields[1] ?? "false") === "true",
  exitCode: Number(fields[2] ?? "0"),
}));

const payload = {
  type: "run_event_cycle_rpc_auto_remediation",
  status,
  attempt: Number(process.env.GHOST_RPC_REMEDIATION_ATTEMPT ?? "0"),
  maxAttempts: Number(process.env.GHOST_RPC_REMEDIATION_MAX_ATTEMPTS ?? "0"),
  sourcePreflightLogPath: process.env.GHOST_RPC_REMEDIATION_SOURCE_PREFLIGHT_LOG ?? "",
  remediationRunLogPath: process.env.GHOST_RPC_REMEDIATION_RUN_LOG ?? "",
  restartCount: Number(process.env.GHOST_RPC_REMEDIATION_RESTART_COUNT ?? "0"),
  restartSuccessCount: Number(process.env.GHOST_RPC_REMEDIATION_RESTART_SUCCESS_COUNT ?? "0"),
  failures,
  restarts,
  generatedAtUtc: new Date().toISOString(),
};

if (summaryPath) {
  await writeFile(summaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

process.stdout.write(
  `${JSON.stringify({
    status: payload.status,
    restartCount: payload.restartCount,
    restartSuccessCount: payload.restartSuccessCount,
    summaryPath,
  })}\n`,
);
EOF

  rm -f "${failure_tsv}" "${restart_tsv}"

  echo "rpc_auto_remediation_log=${summary_log}" >&2
  echo "rpc_auto_remediation_run_log=${run_log}" >&2

  if [[ "${status}" == "restart_attempted" ]]; then
    return 0
  fi
  if [[ "${status}" == "no_failures" ]]; then
    return 0
  fi
  return 1
}

run_rpc_preflight_mitigation_after_recovery() {
  local timestamp
  local mitigation_log
  local mitigation_run_log
  local mitigation_rc

  timestamp="$(timestamp_slug_utc)"
  mitigation_log="${LOG_DIR}/event-cycle-rpc-preflight-mitigation-${timestamp}.json"
  mitigation_run_log="${LOG_DIR}/event-cycle-rpc-preflight-mitigation-${timestamp}-run.log"

  RPC_PREFLIGHT_MITIGATION_LOG_PATH="${mitigation_log}"
  RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH="${mitigation_run_log}"

  set +e
  node --experimental-strip-types \
    "${ROOT_DIR}/tools/ghostcontrol/orchestrator/rpc_preflight_mitigator.ts" \
    --db-path "${DB_PATH}" \
    --log-path "${mitigation_log}" \
    --source-log-path "${RPC_PREFLIGHT_LOG_PATH}" \
    --trigger auto_remediation_recovered \
    > "${mitigation_run_log}" 2>&1
  mitigation_rc=$?
  set -e

  if [[ "${mitigation_rc}" -eq 0 ]]; then
    RPC_PREFLIGHT_MITIGATION_STATUS="ok"
  else
    RPC_PREFLIGHT_MITIGATION_STATUS="failed"
    cat > "${mitigation_log}" <<EOF
{
  "status": "rpc_preflight_mitigation_failed",
  "source_preflight_log_path": "${RPC_PREFLIGHT_LOG_PATH}",
  "run_log_path": "${mitigation_run_log}",
  "exit_code": ${mitigation_rc},
  "generated_at_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  fi

  echo "rpc_preflight_mitigation_log=${mitigation_log}" >&2
  echo "rpc_preflight_mitigation_run_log=${mitigation_run_log}" >&2
}

record_rpc_preflight_incident() {
  local mode="$1"
  local timestamp
  local incident_log
  local collector_log
  local severity
  local summary

  timestamp="$(timestamp_slug_utc)"
  incident_log="${LOG_DIR}/event-cycle-rpc-preflight-${timestamp}-incident.json"
  collector_log="${LOG_DIR}/event-cycle-rpc-preflight-${timestamp}-collector.log"
  severity="error"
  if [[ "${mode}" == "fail" ]]; then
    severity="critical"
  fi
  summary="run_event_cycle rpc preflight degraded"

  if ! GHOST_RPC_INCIDENT_DB_PATH="${DB_PATH}" \
    GHOST_RPC_INCIDENT_LOG_PATH="${incident_log}" \
    GHOST_RPC_PREFLIGHT_LOG_PATH="${RPC_PREFLIGHT_LOG_PATH}" \
    GHOST_RPC_PREFLIGHT_MODE="${mode}" \
    GHOST_RPC_PREFLIGHT_RETRIES="${RPC_PREFLIGHT_RETRIES}" \
    GHOST_RPC_PREFLIGHT_RETRY_DELAY_SECONDS="${RPC_PREFLIGHT_RETRY_DELAY_SECONDS}" \
    GHOST_EVENT_REASON="${EVENT_REASON}" \
    GHOST_VM_TARGET="${VM_TARGET}" \
    GHOST_GOVERNANCE_MODE="${GOVERNANCE_MODE}" \
    GHOST_RISK_BUDGET="${RISK_BUDGET}" \
    GHOST_RPC_SEVERITY="${severity}" \
    GHOST_RPC_SUMMARY="${summary}" \
    node --experimental-strip-types --input-type=module >"${collector_log}" 2>&1 <<'EOF'
import { writeFile } from "node:fs/promises";

import { collectIncidents } from "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/collector.ts";

const incidentLogPath = process.env.GHOST_RPC_INCIDENT_LOG_PATH ?? "";
const detail = {
  type: "run_event_cycle_rpc_preflight_degraded",
  rpcPreflightLogPath: process.env.GHOST_RPC_PREFLIGHT_LOG_PATH ?? "",
  mode: process.env.GHOST_RPC_PREFLIGHT_MODE ?? "fail",
  retries: Number(process.env.GHOST_RPC_PREFLIGHT_RETRIES ?? "3"),
  retryDelaySeconds: Number(
    process.env.GHOST_RPC_PREFLIGHT_RETRY_DELAY_SECONDS ?? "3",
  ),
  eventReason: process.env.GHOST_EVENT_REASON ?? "",
  vmTarget: process.env.GHOST_VM_TARGET ?? "",
  governanceMode: process.env.GHOST_GOVERNANCE_MODE ?? "",
  riskBudget: process.env.GHOST_RISK_BUDGET ?? "",
  generatedAtUtc: new Date().toISOString(),
};

if (incidentLogPath) {
  await writeFile(incidentLogPath, `${JSON.stringify(detail, null, 2)}\n`, "utf8");
}

const collectorResult = collectIncidents({
  dbPath: process.env.GHOST_RPC_INCIDENT_DB_PATH,
  signals: [
    {
      service: "event-cycle",
      severity: process.env.GHOST_RPC_SEVERITY ?? "error",
      summary: process.env.GHOST_RPC_SUMMARY ?? "run_event_cycle rpc preflight degraded",
      symptoms: [
        `rpc_preflight_log=${detail.rpcPreflightLogPath}`,
        `mode=${detail.mode}`,
        `retries=${String(detail.retries)}`,
        `retry_delay_seconds=${String(detail.retryDelaySeconds)}`,
        `event_reason=${detail.eventReason}`,
        `vm_target=${detail.vmTarget}`,
        `governance_mode=${detail.governanceMode}`,
        `risk_budget=${detail.riskBudget}`,
      ],
      logsRef: detail.rpcPreflightLogPath || incidentLogPath || undefined,
    },
  ],
});

process.stdout.write(
  `${JSON.stringify({
    status: "ok",
    incidentLogPath,
    collectorResult,
  })}\n`,
);
EOF
  then
    cat > "${collector_log}" <<'EOF'
{"status":"collector_failed"}
EOF
  fi

  if [[ ! -f "${incident_log}" ]]; then
    cat > "${incident_log}" <<EOF
{"type":"run_event_cycle_rpc_preflight_degraded","mode":"${mode}","rpc_preflight_log":"${RPC_PREFLIGHT_LOG_PATH}","generated_at_utc":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF
  fi

  echo "rpc_preflight_incident_log=${incident_log}" >&2
  echo "rpc_preflight_collector_log=${collector_log}" >&2
}

record_disk_pressure_incident() {
  local free_mb="$1"
  local threshold_mb="$2"
  local mode="$3"
  local timestamp
  local incident_log
  local collector_log
  local severity
  local summary

  timestamp="$(timestamp_slug_utc)"
  incident_log="${LOG_DIR}/event-cycle-disk-pressure-${timestamp}.json"
  collector_log="${LOG_DIR}/event-cycle-disk-pressure-${timestamp}-collector.log"
  severity="warn"
  if [[ "${mode}" == "fail" ]]; then
    severity="critical"
  fi
  summary="run_event_cycle host disk pressure"

  if ! GHOST_DISK_INCIDENT_DB_PATH="${DB_PATH}" \
    GHOST_DISK_INCIDENT_LOG_PATH="${incident_log}" \
    GHOST_DISK_FREE_MB="${free_mb}" \
    GHOST_DISK_THRESHOLD_MB="${threshold_mb}" \
    GHOST_DISK_MODE="${mode}" \
    GHOST_EVENT_REASON="${EVENT_REASON}" \
    GHOST_VM_TARGET="${VM_TARGET}" \
    GHOST_GOVERNANCE_MODE="${GOVERNANCE_MODE}" \
    GHOST_RISK_BUDGET="${RISK_BUDGET}" \
    GHOST_DISK_SEVERITY="${severity}" \
    GHOST_DISK_SUMMARY="${summary}" \
    node --experimental-strip-types --input-type=module >"${collector_log}" 2>&1 <<'EOF'
import { writeFile } from "node:fs/promises";

import { collectIncidents } from "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/collector.ts";

const incidentLogPath = process.env.GHOST_DISK_INCIDENT_LOG_PATH ?? "";
const detail = {
  type: "run_event_cycle_disk_pressure",
  freeDiskMb: Number(process.env.GHOST_DISK_FREE_MB ?? "0"),
  thresholdMb: Number(process.env.GHOST_DISK_THRESHOLD_MB ?? "0"),
  mode: process.env.GHOST_DISK_MODE ?? "warn",
  eventReason: process.env.GHOST_EVENT_REASON ?? "",
  vmTarget: process.env.GHOST_VM_TARGET ?? "",
  governanceMode: process.env.GHOST_GOVERNANCE_MODE ?? "",
  riskBudget: process.env.GHOST_RISK_BUDGET ?? "",
  generatedAtUtc: new Date().toISOString(),
};

if (incidentLogPath) {
  await writeFile(incidentLogPath, `${JSON.stringify(detail, null, 2)}\n`, "utf8");
}

const collectorResult = collectIncidents({
  dbPath: process.env.GHOST_DISK_INCIDENT_DB_PATH,
  signals: [
    {
      service: "event-cycle",
      severity: process.env.GHOST_DISK_SEVERITY ?? "warn",
      summary: process.env.GHOST_DISK_SUMMARY ?? "run_event_cycle host disk pressure",
      symptoms: [
        `free_disk_mb=${String(detail.freeDiskMb)}`,
        `threshold_mb=${String(detail.thresholdMb)}`,
        `mode=${detail.mode}`,
        `event_reason=${detail.eventReason}`,
        `vm_target=${detail.vmTarget}`,
        `governance_mode=${detail.governanceMode}`,
        `risk_budget=${detail.riskBudget}`,
      ],
      logsRef: incidentLogPath || undefined,
    },
  ],
});

process.stdout.write(
  `${JSON.stringify({
    status: "ok",
    incidentLogPath,
    collectorResult,
  })}\n`,
);
EOF
  then
    cat > "${collector_log}" <<'EOF'
{"status":"collector_failed"}
EOF
  fi

  if [[ ! -f "${incident_log}" ]]; then
    cat > "${incident_log}" <<EOF
{"type":"run_event_cycle_disk_pressure","free_disk_mb":${free_mb},"threshold_mb":${threshold_mb},"mode":"${mode}","generated_at_utc":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF
  fi

  echo "disk_pressure_incident_log=${incident_log}" >&2
  echo "disk_pressure_collector_log=${collector_log}" >&2
}

FREE_DISK_MB_AT_START="$(read_free_disk_mb "${ROOT_DIR}")"
if (( FREE_DISK_MB_AT_START < MIN_FREE_DISK_MB )); then
  record_disk_pressure_incident "${FREE_DISK_MB_AT_START}" "${MIN_FREE_DISK_MB}" "${DISK_PRESSURE_MODE}"
  echo "event_cycle_disk_pressure free_mb=${FREE_DISK_MB_AT_START} threshold_mb=${MIN_FREE_DISK_MB} mode=${DISK_PRESSURE_MODE}" >&2
  if [[ "${DISK_PRESSURE_MODE}" == "fail" ]]; then
    exit 1
  fi
fi

run_rpc_preflight_probe
if [[ "${RPC_PREFLIGHT_OK}" != "true" && "${RPC_AUTO_REMEDIATION_ENABLED}" == "true" ]]; then
  while [[ "${RPC_PREFLIGHT_OK}" != "true" && "${RPC_AUTO_REMEDIATION_ATTEMPTS}" -lt "${RPC_AUTO_REMEDIATION_MAX_ATTEMPTS}" ]]; do
    RPC_AUTO_REMEDIATION_ATTEMPTS="$((RPC_AUTO_REMEDIATION_ATTEMPTS + 1))"
    if ! run_rpc_auto_remediation_attempt "${RPC_AUTO_REMEDIATION_ATTEMPTS}"; then
      echo "event_cycle_rpc_auto_remediation_no_effect attempt=${RPC_AUTO_REMEDIATION_ATTEMPTS}" >&2
    fi
    if [[ "${RPC_AUTO_REMEDIATION_DELAY_SECONDS}" -gt 0 ]]; then
      sleep "${RPC_AUTO_REMEDIATION_DELAY_SECONDS}"
    fi
    run_rpc_preflight_probe
    if [[ "${RPC_PREFLIGHT_OK}" == "true" ]]; then
      RPC_AUTO_REMEDIATION_RECOVERED="true"
      echo "event_cycle_rpc_auto_remediation_recovered attempts=${RPC_AUTO_REMEDIATION_ATTEMPTS}" >&2
      break
    fi
  done
fi

if [[ "${RPC_PREFLIGHT_OK}" == "true" && "${RPC_AUTO_REMEDIATION_RECOVERED}" == "true" ]]; then
  run_rpc_preflight_mitigation_after_recovery
fi

if [[ "${RPC_PREFLIGHT_OK}" != "true" ]]; then
  record_rpc_preflight_incident "${RPC_PREFLIGHT_MODE}"
  echo "event_cycle_rpc_preflight_degraded mode=${RPC_PREFLIGHT_MODE} retries=${RPC_PREFLIGHT_RETRIES} delay_seconds=${RPC_PREFLIGHT_RETRY_DELAY_SECONDS}" >&2
  if [[ "${RPC_PREFLIGHT_MODE}" == "fail" ]]; then
    exit 1
  fi
fi

record_lock_timeout_incident() {
  local timestamp
  local incident_log
  local collector_log

  timestamp="$(timestamp_slug_utc)"
  incident_log="${LOG_DIR}/event-cycle-lock-timeout-${timestamp}.json"
  collector_log="${LOG_DIR}/event-cycle-lock-timeout-${timestamp}-collector.log"

  if ! GHOST_LOCK_INCIDENT_DB_PATH="${DB_PATH}" \
    GHOST_LOCK_INCIDENT_LOG_PATH="${incident_log}" \
    GHOST_LOCK_FILE="${LOCK_FILE}" \
    GHOST_LOCK_WAIT_SECONDS="${LOCK_WAIT_SECONDS}" \
    GHOST_EVENT_REASON="${EVENT_REASON}" \
    GHOST_VM_TARGET="${VM_TARGET}" \
    GHOST_GOVERNANCE_MODE="${GOVERNANCE_MODE}" \
    GHOST_RISK_BUDGET="${RISK_BUDGET}" \
    node --experimental-strip-types --input-type=module >"${collector_log}" 2>&1 <<'EOF'
import { writeFile } from "node:fs/promises";

import { collectIncidents } from "/home/ghost/ghostl-stack/tools/ghostcontrol/incidents/collector.ts";

const incidentLogPath = process.env.GHOST_LOCK_INCIDENT_LOG_PATH ?? "";
const detail = {
  type: "run_event_cycle_lock_timeout",
  lockFile: process.env.GHOST_LOCK_FILE ?? "",
  lockWaitSeconds: Number(process.env.GHOST_LOCK_WAIT_SECONDS ?? "0"),
  eventReason: process.env.GHOST_EVENT_REASON ?? "",
  vmTarget: process.env.GHOST_VM_TARGET ?? "",
  governanceMode: process.env.GHOST_GOVERNANCE_MODE ?? "",
  riskBudget: process.env.GHOST_RISK_BUDGET ?? "",
  generatedAtUtc: new Date().toISOString(),
};

if (incidentLogPath) {
  await writeFile(incidentLogPath, `${JSON.stringify(detail, null, 2)}\n`, "utf8");
}

const collectorResult = collectIncidents({
  dbPath: process.env.GHOST_LOCK_INCIDENT_DB_PATH,
  signals: [
    {
      service: "event-cycle",
      severity: "error",
      summary: "run_event_cycle lock contention timeout",
      symptoms: [
        `lock_file=${detail.lockFile}`,
        `lock_wait_seconds=${String(detail.lockWaitSeconds)}`,
        `event_reason=${detail.eventReason}`,
        `vm_target=${detail.vmTarget}`,
        `governance_mode=${detail.governanceMode}`,
        `risk_budget=${detail.riskBudget}`,
      ],
      logsRef: incidentLogPath || undefined,
    },
  ],
});

process.stdout.write(
  `${JSON.stringify({
    status: "ok",
    incidentLogPath,
    collectorResult,
  })}\n`,
);
EOF
  then
    cat > "${collector_log}" <<'EOF'
{"status":"collector_failed"}
EOF
  fi

  if [[ ! -f "${incident_log}" ]]; then
    cat > "${incident_log}" <<EOF
{"type":"run_event_cycle_lock_timeout","lock_file":"${LOCK_FILE}","generated_at_utc":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF
  fi

  echo "lock_contention_incident_log=${incident_log}" >&2
  echo "lock_contention_collector_log=${collector_log}" >&2
}

exec 200>"${LOCK_FILE}"
if ! flock -w "${LOCK_WAIT_SECONDS}" 200; then
  record_lock_timeout_incident
  echo "event_cycle_lock_timeout wait_seconds=${LOCK_WAIT_SECONDS} lock_file=${LOCK_FILE}" >&2
  exit 1
fi

NEXT_ITERATION="${ITERATION_OVERRIDE:-$(sqlite3 "${DB_PATH}" "SELECT COALESCE(MAX(iteration), 0) + 1 FROM checkpoints;")}"
if [[ ! "${NEXT_ITERATION}" =~ ^[0-9]+$ ]]; then
  echo "Failed to resolve next iteration number: ${NEXT_ITERATION}" >&2
  exit 1
fi

EVENT_CONTEXT_LOG="${LOG_DIR}/iteration-${NEXT_ITERATION}-event-context.json"
cat > "${EVENT_CONTEXT_LOG}" <<EOF
{
  "iteration": ${NEXT_ITERATION},
  "event_reason": "${EVENT_REASON}",
  "vm_target": "${VM_TARGET}",
  "risk_budget": "${RISK_BUDGET}",
  "governance_mode": "${GOVERNANCE_MODE}",
  "governance_proposal_id": "${GOVERNANCE_PROPOSAL_ID}",
  "governance_gate_file": "${GOVERNANCE_GATE_FILE}",
  "compose_file": "${COMPOSE_FILE}",
  "docker_group": "${GHOST_DOCKER_GROUP}",
  "rpc_l1": "${L1_RPC}",
  "rpc_l2": "${L2_RPC}",
  "rpc_l3": "${L3_RPC}",
  "l1_chain_id": ${L1_CHAIN_ID},
  "l2_chain_id": ${L2_CHAIN_ID},
  "l3_chain_id": ${L3_CHAIN_ID},
  "lock_file": "${LOCK_FILE}",
  "lock_wait_seconds": ${LOCK_WAIT_SECONDS},
  "min_free_disk_mb": ${MIN_FREE_DISK_MB},
  "disk_pressure_mode": "${DISK_PRESSURE_MODE}",
  "free_disk_mb_at_start": ${FREE_DISK_MB_AT_START},
  "rpc_preflight_mode": "${RPC_PREFLIGHT_MODE}",
  "rpc_preflight_retries": ${RPC_PREFLIGHT_RETRIES},
  "rpc_preflight_retry_delay_seconds": ${RPC_PREFLIGHT_RETRY_DELAY_SECONDS},
  "rpc_preflight_ok": ${RPC_PREFLIGHT_OK},
  "rpc_preflight_log_path": "${RPC_PREFLIGHT_LOG_PATH}",
  "rpc_preflight_probe_log_path": "${RPC_PREFLIGHT_PROBE_LOG_PATH}",
  "rpc_auto_remediation_enabled": ${RPC_AUTO_REMEDIATION_ENABLED},
  "rpc_auto_remediation_max_attempts": ${RPC_AUTO_REMEDIATION_MAX_ATTEMPTS},
  "rpc_auto_remediation_delay_seconds": ${RPC_AUTO_REMEDIATION_DELAY_SECONDS},
  "rpc_auto_remediation_attempts": ${RPC_AUTO_REMEDIATION_ATTEMPTS},
  "rpc_auto_remediation_recovered": ${RPC_AUTO_REMEDIATION_RECOVERED},
  "rpc_auto_remediation_last_log_path": "${RPC_AUTO_REMEDIATION_LAST_LOG_PATH}",
  "rpc_auto_remediation_last_run_log_path": "${RPC_AUTO_REMEDIATION_LAST_RUN_LOG_PATH}",
  "rpc_preflight_mitigation_status": "${RPC_PREFLIGHT_MITIGATION_STATUS}",
  "rpc_preflight_mitigation_log_path": "${RPC_PREFLIGHT_MITIGATION_LOG_PATH}",
  "rpc_preflight_mitigation_run_log_path": "${RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH}",
  "generated_at_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

cd "${GC_DIR}"
npx tsc -p tsconfig.ghostloop.json > "evidence/logs/iteration-${NEXT_ITERATION}-typecheck.log"
node --test --experimental-strip-types tests/*.test.ts > "evidence/logs/iteration-${NEXT_ITERATION}-tests.log"
bash security/trivy/scan-images.sh > "evidence/logs/iteration-${NEXT_ITERATION}-trivy-images.log"
bash security/trivy/scan-secrets.sh > "evidence/logs/iteration-${NEXT_ITERATION}-trivy-secrets.log"

cd "${ROOT_DIR}"
L1_RPC="${L1_RPC}" \
L2_RPC="${L2_RPC}" \
L3_RPC="${L3_RPC}" \
RPC_L1="${L1_RPC}" \
RPC_L2="${L2_RPC}" \
RPC_L3="${L3_RPC}" \
L1_CHAIN_ID="${L1_CHAIN_ID}" \
L2_CHAIN_ID="${L2_CHAIN_ID}" \
L3_CHAIN_ID="${L3_CHAIN_ID}" \
GOVERNANCE_MODE="${GOVERNANCE_MODE}" \
GHOST_GOVERNANCE_MODE="${GOVERNANCE_MODE}" \
GOVERNANCE_PROPOSAL_ID="${GOVERNANCE_PROPOSAL_ID}" \
GOVERNANCE_GATE_FILE="${GOVERNANCE_GATE_FILE}" \
GHOST_DOCKER_GROUP="${GHOST_DOCKER_GROUP}" \
node --experimental-strip-types \
  tools/ghostcontrol/orchestrator/ghostloop.ts \
  --iteration "${NEXT_ITERATION}" \
  --vm "${VM_TARGET}" \
  --compose "${COMPOSE_FILE}" \
  --risk "${RISK_BUDGET}" \
  --governance "${GOVERNANCE_MODE}" \
  > "tools/ghostcontrol/evidence/logs/iteration-${NEXT_ITERATION}-ghostloop-result.json"

LOCK_MITIGATION_LOG="${LOG_DIR}/iteration-${NEXT_ITERATION}-lock-contention-mitigation.json"
LOCK_MITIGATION_RUN_LOG="${LOG_DIR}/iteration-${NEXT_ITERATION}-lock-contention-mitigation-run.log"
set +e
node --experimental-strip-types \
  tools/ghostcontrol/orchestrator/lock_contention_mitigator.ts \
  --db-path "${DB_PATH}" \
  --log-path "${LOCK_MITIGATION_LOG}" \
  --iteration "${NEXT_ITERATION}" \
  > "${LOCK_MITIGATION_RUN_LOG}" 2>&1
LOCK_MITIGATION_RC=$?
set -e
if [[ "${LOCK_MITIGATION_RC}" -ne 0 ]]; then
  cat > "${LOCK_MITIGATION_LOG}" <<EOF
{
  "status": "lock_contention_mitigation_failed",
  "iteration": ${NEXT_ITERATION},
  "exit_code": ${LOCK_MITIGATION_RC},
  "run_log_path": "${LOCK_MITIGATION_RUN_LOG}",
  "generated_at_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
fi

GHOST_ITERATION="${NEXT_ITERATION}" \
GHOST_RPC_PREFLIGHT_MITIGATION_LOG_PATH="${RPC_PREFLIGHT_MITIGATION_LOG_PATH}" \
GHOST_RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH="${RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH}" \
node --experimental-strip-types --input-type=module <<'EOF'
import { existsSync } from "node:fs";
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

  const artifacts = [
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
        type: "incident_mitigation",
        uri: `${logDir}/iteration-${iteration}-lock-contention-mitigation.json`,
        notes: "Lock-contention incident auto-mitigation summary",
      },
      {
        type: "incident_mitigation_log",
        uri: `${logDir}/iteration-${iteration}-lock-contention-mitigation-run.log`,
        notes: "Lock-contention mitigator execution output",
      },
      {
        type: "chain_identity_attestation",
        uri: `/home/ghost/ghostl-stack/tools/ghostcontrol/evidence/attestations/iteration-${iteration}-chain-identity-attestation.json`,
        notes: "Signed L1/L2/L3 chain identity attestation",
      },
      {
        type: "db_snapshot",
        uri: dbStatusPath,
        notes: "Incident/patch/checkpoint DB snapshot",
      },
  ];

  const rpcMitigationLogPath = process.env.GHOST_RPC_PREFLIGHT_MITIGATION_LOG_PATH ?? "";
  const rpcMitigationRunLogPath = process.env.GHOST_RPC_PREFLIGHT_MITIGATION_RUN_LOG_PATH ?? "";
  if (rpcMitigationLogPath && existsSync(rpcMitigationLogPath)) {
    artifacts.push({
      type: "rpc_preflight_incident_mitigation",
      uri: rpcMitigationLogPath,
      notes: "RPC preflight incident auto-mitigation summary",
    });
  }
  if (rpcMitigationRunLogPath && existsSync(rpcMitigationRunLogPath)) {
    artifacts.push({
      type: "rpc_preflight_incident_mitigation_log",
      uri: rpcMitigationRunLogPath,
      notes: "RPC preflight mitigator execution output",
    });
  }

  const packaged = await packageEvidence({
    dbPath,
    artifacts,
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
