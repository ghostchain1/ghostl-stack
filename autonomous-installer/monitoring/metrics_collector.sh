#!/usr/bin/env bash
# GhostStack Autonomous Installer — Metrics Collector
#
# Collects host and chain metrics and writes a JSON snapshot to
# METRICS_FILE.  The GhostBrain Supervisor reads this file at
# GET :9100/metrics (via the in-process MetricsCollector); this script
# provides a supplementary host-level view for the guardian.
#
# Metrics collected:
#   Host : CPU idle %, RAM used %, disk used % (root fs)
#   Chain: block heights for L1/L2/L3
#   Lag  : L2 lag behind L1, L3 lag behind L2 (settlement health)
#
# Reading /proc/stat for CPU is more reliable than parsing top output.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

info()  { echo "[$(date +%H:%M:%S)] [metrics] $*"; }
warn()  { echo "[$(date +%H:%M:%S)] [metrics] WARN $*" >&2; }

METRICS_FILE="${ROOT}/.tmp/metrics_snapshot.json"
PROBE_TIMEOUT_S="${METRICS_PROBE_TIMEOUT_S:-5}"

mkdir -p "${ROOT}/.tmp"

# ---------------------------------------------------------------------------
# CPU — read /proc/stat directly (Linux only)
# Two samples 0.5s apart to get a real delta.
# ---------------------------------------------------------------------------

cpu_idle_pct() {
  if [[ ! -f /proc/stat ]]; then
    echo "null"; return
  fi

  read_cpu_total() {
    local line
    line="$(grep '^cpu ' /proc/stat)"
    # Fields: user nice system idle iowait irq softirq steal
    read -ra f <<< "$line"
    local total=$(( f[1]+f[2]+f[3]+f[4]+f[5]+f[6]+f[7]+f[8] ))
    local idle="${f[4]}"
    echo "${total} ${idle}"
  }

  local s1 s2 t1 i1 t2 i2
  s1="$(read_cpu_total)"
  sleep 0.5
  s2="$(read_cpu_total)"

  t1="${s1%% *}"; i1="${s1##* }"
  t2="${s2%% *}"; i2="${s2##* }"

  local dt=$(( t2 - t1 ))
  local di=$(( i2 - i1 ))

  if [[ "${dt}" -le 0 ]]; then
    echo "null"; return
  fi
  # Integer arithmetic; multiply by 100 then divide.
  echo $(( di * 100 / dt ))
}

# ---------------------------------------------------------------------------
# RAM — /proc/meminfo
# ---------------------------------------------------------------------------

ram_used_pct() {
  if [[ ! -f /proc/meminfo ]]; then
    echo "null"; return
  fi
  local total available
  total="$(awk '/^MemTotal:/{print $2}' /proc/meminfo)"
  available="$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)"
  if [[ -z "${total}" || "${total}" -eq 0 ]]; then
    echo "null"; return
  fi
  echo $(( (total - available) * 100 / total ))
}

# ---------------------------------------------------------------------------
# Disk — df root FS
# ---------------------------------------------------------------------------

disk_used_pct() {
  local pct
  pct="$(df --output=pcent / 2>/dev/null | tail -1 | tr -d ' %')" 2>/dev/null || pct=""
  [[ -n "${pct}" && "${pct}" =~ ^[0-9]+$ ]] && echo "${pct}" || echo "null"
}

# ---------------------------------------------------------------------------
# Chain block heights via ghost_blockNumber
# ---------------------------------------------------------------------------

rpc_height() {
  local url="$1"
  local result hex
  result="$(curl -sf --max-time "${PROBE_TIMEOUT_S}" \
    -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"ghost_blockNumber","params":[],"id":1}' \
    "${url}" 2>/dev/null)" || { echo "null"; return; }
  hex="$(echo "${result}" | jq -r '.result // empty' 2>/dev/null)" || { echo "null"; return; }
  printf '%d' "${hex}" 2>/dev/null || echo "null"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

info "Collecting host metrics…"

CPU_IDLE="$(cpu_idle_pct)"
RAM_USED="$(ram_used_pct)"
DISK_USED="$(disk_used_pct)"

info "  CPU idle: ${CPU_IDLE}%  RAM used: ${RAM_USED}%  Disk used: ${DISK_USED}%"

info "Collecting chain metrics…"

L1_HEIGHT="$(rpc_height http://localhost:18545)"
L2_HEIGHT="$(rpc_height http://localhost:29545)"
L3_HEIGHT="$(rpc_height http://localhost:39545)"

info "  L1 block: ${L1_HEIGHT}  L2 block: ${L2_HEIGHT}  L3 block: ${L3_HEIGHT}"

# Compute settlement lag (null-safe).
l2_lag="null"
l3_lag="null"
if [[ "${L1_HEIGHT}" != "null" && "${L2_HEIGHT}" != "null" ]]; then
  l2_lag=$(( L1_HEIGHT - L2_HEIGHT ))
  [[ "${l2_lag}" -lt 0 ]] && l2_lag=0
fi
if [[ "${L2_HEIGHT}" != "null" && "${L3_HEIGHT}" != "null" ]]; then
  l3_lag=$(( L2_HEIGHT - L3_HEIGHT ))
  [[ "${l3_lag}" -lt 0 ]] && l3_lag=0
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg ts      "${NOW}" \
  --arg cpu     "${CPU_IDLE}" \
  --arg ram     "${RAM_USED}" \
  --arg disk    "${DISK_USED}" \
  --arg l1h     "${L1_HEIGHT}" \
  --arg l2h     "${L2_HEIGHT}" \
  --arg l3h     "${L3_HEIGHT}" \
  --arg l2lag   "${l2_lag}" \
  --arg l3lag   "${l3_lag}" \
  '{
    "timestamp":        $ts,
    "host": {
      "cpu_idle_pct":   ($cpu   | if . == "null" then null else tonumber end),
      "ram_used_pct":   ($ram   | if . == "null" then null else tonumber end),
      "disk_used_pct":  ($disk  | if . == "null" then null else tonumber end)
    },
    "chains": {
      "l1_block_height": ($l1h  | if . == "null" then null else tonumber end),
      "l2_block_height": ($l2h  | if . == "null" then null else tonumber end),
      "l3_block_height": ($l3h  | if . == "null" then null else tonumber end),
      "l2_lag_blocks":   ($l2lag| if . == "null" then null else tonumber end),
      "l3_lag_blocks":   ($l3lag| if . == "null" then null else tonumber end)
    }
  }' > "${METRICS_FILE}"

info "Metrics written → ${METRICS_FILE}"
