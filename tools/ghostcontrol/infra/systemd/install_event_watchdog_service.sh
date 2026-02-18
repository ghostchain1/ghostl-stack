#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ghost/ghostl-stack"
UNIT_SRC_DIR="${ROOT_DIR}/tools/ghostcontrol/infra/systemd"
UNIT_DST_DIR="/etc/systemd/system"
LOG_DIR="${ROOT_DIR}/tools/ghostcontrol/evidence/logs"

SERVICE="ghostcontrol-event-watchdog.service"
HEALTH_SERVICE="ghostcontrol-event-watchdog-healthcheck.service"
HEALTH_TIMER="ghostcontrol-event-watchdog-healthcheck.timer"
RECOVERY_SERVICE="ghostcontrol-event-watchdog-recovery.service"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo not found" >&2
  exit 1
fi

if ! sudo -n true >/dev/null 2>&1; then
  echo "passwordless sudo is required for system service installation" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"

for unit in "${SERVICE}" "${HEALTH_SERVICE}" "${HEALTH_TIMER}" "${RECOVERY_SERVICE}"; do
  if [[ ! -f "${UNIT_SRC_DIR}/${unit}" ]]; then
    echo "missing unit file: ${UNIT_SRC_DIR}/${unit}" >&2
    exit 1
  fi
  sudo install -m 0644 "${UNIT_SRC_DIR}/${unit}" "${UNIT_DST_DIR}/${unit}"
done

sudo systemctl daemon-reload

# Stop any manually started watchdog process to avoid duplicate event runners.
pkill -f "tools/ghostcontrol/orchestrator/event_watchdog.ts" >/dev/null 2>&1 || true
rm -f "${LOG_DIR}/event-watchdog.pid"

sudo systemctl enable --now "${SERVICE}"
sudo systemctl enable --now "${HEALTH_TIMER}"
# Kick one immediate health probe so staleness reporting is populated now.
sudo systemctl start "${HEALTH_SERVICE}" || true

echo "installed_units=${SERVICE},${HEALTH_SERVICE},${HEALTH_TIMER},${RECOVERY_SERVICE}"
echo "service_active=$(systemctl is-active ${SERVICE})"
echo "timer_active=$(systemctl is-active ${HEALTH_TIMER})"
echo "status_path=${ROOT_DIR}/tools/ghostcontrol/evidence/logs/event-watchdog.status.json"

echo "--- ${SERVICE} ---"
sudo systemctl --no-pager --full status "${SERVICE}" | sed -n '1,40p'

echo "--- ${HEALTH_TIMER} ---"
sudo systemctl --no-pager --full status "${HEALTH_TIMER}" | sed -n '1,40p'

echo "--- ${RECOVERY_SERVICE} ---"
sudo systemctl --no-pager --full status "${RECOVERY_SERVICE}" | sed -n '1,40p' || true
