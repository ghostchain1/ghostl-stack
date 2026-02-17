#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ghost/ghostl-stack"
GC_DIR="${ROOT_DIR}/tools/ghostcontrol"
LOG_DIR="${GC_DIR}/evidence/logs"

WATCHDOG_SERVICE="ghostcontrol-event-watchdog.service"
HEALTHCHECK_SERVICE="ghostcontrol-event-watchdog-healthcheck.service"
HEALTHCHECK_TIMER="ghostcontrol-event-watchdog-healthcheck.timer"
RECOVERY_SERVICE="ghostcontrol-event-watchdog-recovery.service"

SYSTEMD_DIR="/etc/systemd/system"
HEALTHCHECK_DROPIN_DIR="${SYSTEMD_DIR}/${HEALTHCHECK_SERVICE}.d"
HEALTHCHECK_DROPIN_FILE="${HEALTHCHECK_DROPIN_DIR}/livefire.conf"
RECOVERY_DROPIN_DIR="${SYSTEMD_DIR}/${RECOVERY_SERVICE}.d"
RECOVERY_DROPIN_FILE="${RECOVERY_DROPIN_DIR}/livefire-restart.conf"

STATUS_PATH="${GC_DIR}/evidence/logs/event-watchdog.status.json"
LIVEFIRE_MISSING_STATUS_PATH="/tmp/ghostcontrol-livefire-missing-status.json"

DEFAULT_MAX_STALE_SECONDS=120
LIVEFIRE_MAX_STALE_SECONDS=5
LIVEFIRE_RECHECK_DELAY_MS=1200
DEFAULT_RECHECK_DELAY_MS=2000
STALE_WAIT_SECONDS=6

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo not found" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found" >&2
  exit 1
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "rg not found" >&2
  exit 1
fi

if ! sudo -n true >/dev/null 2>&1; then
  echo "passwordless sudo is required" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"

DRILL_TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DRILL_EPOCH="$(date +%s)"
SUMMARY_PATH="${LOG_DIR}/event-watchdog-livefire-${DRILL_TS//[:]/}.json"

TMP_DIR="$(mktemp -d)"
BACKUP_HEALTHCHECK_DROPIN="${TMP_DIR}/healthcheck-livefire.conf"
BACKUP_RECOVERY_DROPIN="${TMP_DIR}/recovery-livefire.conf"
HAVE_HEALTHCHECK_BACKUP="0"
HAVE_RECOVERY_BACKUP="0"

cleanup() {
  set +e

  if [[ "${HAVE_HEALTHCHECK_BACKUP}" == "1" ]]; then
    cat "${BACKUP_HEALTHCHECK_DROPIN}" | sudo tee "${HEALTHCHECK_DROPIN_FILE}" >/dev/null
  else
    cat <<EOF | sudo tee "${HEALTHCHECK_DROPIN_FILE}" >/dev/null
[Service]
Environment=GHOSTCONTROL_WATCHDOG_STATUS_PATH=${STATUS_PATH}
Environment=GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS=${DEFAULT_MAX_STALE_SECONDS}
EOF
  fi

  if [[ "${HAVE_RECOVERY_BACKUP}" == "1" ]]; then
    cat "${BACKUP_RECOVERY_DROPIN}" | sudo tee "${RECOVERY_DROPIN_FILE}" >/dev/null
  else
    cat <<EOF | sudo tee "${RECOVERY_DROPIN_FILE}" >/dev/null
[Service]
Environment=GHOSTCONTROL_WATCHDOG_STATUS_PATH=${STATUS_PATH}
Environment=GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS=${DEFAULT_MAX_STALE_SECONDS}
Environment=GHOSTCONTROL_WATCHDOG_RECOVERY_RECHECK_DELAY_MS=${DEFAULT_RECHECK_DELAY_MS}
Environment=GHOSTCONTROL_WATCHDOG_SERVICE_NAME=${WATCHDOG_SERVICE}
EOF
  fi

  sudo systemctl daemon-reload
  sudo systemctl reset-failed "${HEALTHCHECK_SERVICE}" "${RECOVERY_SERVICE}" >/dev/null 2>&1 || true
  sudo systemctl start "${WATCHDOG_SERVICE}" >/dev/null 2>&1 || true
  sudo systemctl start "${HEALTHCHECK_TIMER}" >/dev/null 2>&1 || true
  sudo systemctl start "${HEALTHCHECK_SERVICE}" >/dev/null 2>&1 || true

  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

if sudo test -f "${HEALTHCHECK_DROPIN_FILE}"; then
  sudo cat "${HEALTHCHECK_DROPIN_FILE}" > "${BACKUP_HEALTHCHECK_DROPIN}"
  HAVE_HEALTHCHECK_BACKUP="1"
fi

if sudo test -f "${RECOVERY_DROPIN_FILE}"; then
  sudo cat "${RECOVERY_DROPIN_FILE}" > "${BACKUP_RECOVERY_DROPIN}"
  HAVE_RECOVERY_BACKUP="1"
fi

sudo mkdir -p "${HEALTHCHECK_DROPIN_DIR}" "${RECOVERY_DROPIN_DIR}"

echo "[livefire] phase=onfailure_probe start=${DRILL_TS}"
cat <<EOF | sudo tee "${HEALTHCHECK_DROPIN_FILE}" >/dev/null
[Service]
Environment=GHOSTCONTROL_WATCHDOG_STATUS_PATH=${LIVEFIRE_MISSING_STATUS_PATH}
Environment=GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS=${DEFAULT_MAX_STALE_SECONDS}
EOF
sudo systemctl daemon-reload
sudo systemctl reset-failed "${HEALTHCHECK_SERVICE}" "${RECOVERY_SERVICE}" >/dev/null 2>&1 || true

set +e
sudo systemctl start "${HEALTHCHECK_SERVICE}" >/dev/null 2>&1
ONFAILURE_START_RC=$?
set -e

sleep 1

ONFAILURE_JOURNAL="$(sudo journalctl -u "${HEALTHCHECK_SERVICE}" --since "${DRILL_TS}" --no-pager)"
if ! printf "%s\n" "${ONFAILURE_JOURNAL}" | rg -q "Triggering OnFailure= dependencies."; then
  echo "onfailure_trigger_not_observed" >&2
  exit 1
fi

ONFAILURE_RECOVERY_JOURNAL="$(sudo journalctl -u "${RECOVERY_SERVICE}" --since "${DRILL_TS}" --no-pager)"
if ! printf "%s\n" "${ONFAILURE_RECOVERY_JOURNAL}" | rg -q "Finished ${RECOVERY_SERVICE}"; then
  echo "recovery_service_did_not_finish_after_onfailure" >&2
  exit 1
fi

echo "[livefire] phase=restart_recovery_probe start=${DRILL_TS}"
cat <<EOF | sudo tee "${HEALTHCHECK_DROPIN_FILE}" >/dev/null
[Service]
Environment=GHOSTCONTROL_WATCHDOG_STATUS_PATH=${STATUS_PATH}
Environment=GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS=${DEFAULT_MAX_STALE_SECONDS}
EOF

cat <<EOF | sudo tee "${RECOVERY_DROPIN_FILE}" >/dev/null
[Service]
Environment=GHOSTCONTROL_WATCHDOG_STATUS_PATH=${STATUS_PATH}
Environment=GHOSTCONTROL_WATCHDOG_MAX_STALE_SECONDS=${LIVEFIRE_MAX_STALE_SECONDS}
Environment=GHOSTCONTROL_WATCHDOG_RECOVERY_RECHECK_DELAY_MS=${LIVEFIRE_RECHECK_DELAY_MS}
Environment=GHOSTCONTROL_WATCHDOG_SERVICE_NAME=${WATCHDOG_SERVICE}
EOF

sudo systemctl daemon-reload
sudo systemctl reset-failed "${RECOVERY_SERVICE}" >/dev/null 2>&1 || true
sudo systemctl stop "${WATCHDOG_SERVICE}"
sleep "${STALE_WAIT_SECONDS}"
sudo systemctl start "${RECOVERY_SERVICE}"

LATEST_RECOVERY_ARTIFACT="$(
  ls -1t "${LOG_DIR}"/event-watchdog-recovery-*.json 2>/dev/null | head -n 1 || true
)"
if [[ -z "${LATEST_RECOVERY_ARTIFACT}" ]]; then
  echo "missing_recovery_artifact" >&2
  exit 1
fi

ARTIFACT_MTIME="$(stat -c %Y "${LATEST_RECOVERY_ARTIFACT}")"
if [[ "${ARTIFACT_MTIME}" -lt "${DRILL_EPOCH}" ]]; then
  echo "stale_recovery_artifact_detected path=${LATEST_RECOVERY_ARTIFACT}" >&2
  exit 1
fi

ARTIFACT_ACTION="$(
  node --input-type=module -e 'import fs from "node:fs";
const obj = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(obj.action ?? ""));
' "${LATEST_RECOVERY_ARTIFACT}"
)"
ARTIFACT_AFTER_OK="$(
  node --input-type=module -e 'import fs from "node:fs";
const obj = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(Boolean(obj.after?.ok)));
' "${LATEST_RECOVERY_ARTIFACT}"
)"
ARTIFACT_RESTART_OK="$(
  node --input-type=module -e 'import fs from "node:fs";
const obj = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(Boolean(obj.restart?.ok)));
' "${LATEST_RECOVERY_ARTIFACT}"
)"

if [[ "${ARTIFACT_ACTION}" != "restart_attempted" ]]; then
  echo "unexpected_recovery_action action=${ARTIFACT_ACTION}" >&2
  exit 1
fi
if [[ "${ARTIFACT_AFTER_OK}" != "true" ]]; then
  echo "recovery_did_not_restore_health" >&2
  exit 1
fi
if [[ "${ARTIFACT_RESTART_OK}" != "true" ]]; then
  echo "recovery_restart_failed" >&2
  exit 1
fi

HEALTH_JSON="$(
  cd "${GC_DIR}" && node --experimental-strip-types orchestrator/watchdog_healthcheck.ts
)"
HEALTH_OK="$(
  printf "%s\n" "${HEALTH_JSON}" | node --input-type=module -e 'import fs from "node:fs";
const payload = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(String(Boolean(payload.ok)));
'
)"
if [[ "${HEALTH_OK}" != "true" ]]; then
  echo "final_healthcheck_not_ok" >&2
  exit 1
fi

WATCHDOG_ACTIVE="$(systemctl is-active "${WATCHDOG_SERVICE}" || true)"
TIMER_ACTIVE="$(systemctl is-active "${HEALTHCHECK_TIMER}" || true)"
if [[ "${WATCHDOG_ACTIVE}" != "active" ]]; then
  echo "watchdog_not_active_after_drill state=${WATCHDOG_ACTIVE}" >&2
  exit 1
fi
if [[ "${TIMER_ACTIVE}" != "active" ]]; then
  echo "healthcheck_timer_not_active_after_drill state=${TIMER_ACTIVE}" >&2
  exit 1
fi

cat > "${SUMMARY_PATH}" <<EOF
{
  "drill_started_utc": "${DRILL_TS}",
  "onfailure_start_rc": ${ONFAILURE_START_RC},
  "onfailure_triggered": true,
  "recovery_service_finished_after_onfailure": true,
  "restart_probe": {
    "artifact_path": "${LATEST_RECOVERY_ARTIFACT}",
    "action": "${ARTIFACT_ACTION}",
    "restart_ok": ${ARTIFACT_RESTART_OK},
    "after_ok": ${ARTIFACT_AFTER_OK}
  },
  "final_health_ok": ${HEALTH_OK},
  "watchdog_service_state": "${WATCHDOG_ACTIVE}",
  "healthcheck_timer_state": "${TIMER_ACTIVE}"
}
EOF

echo "[livefire] summary_path=${SUMMARY_PATH}"
cat "${SUMMARY_PATH}"
