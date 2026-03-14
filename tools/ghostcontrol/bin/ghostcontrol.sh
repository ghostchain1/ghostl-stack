#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/compose/docker-compose.yml"
EVIDENCE_DIR_DEFAULT="${ROOT_DIR}/../../evidence/phase1"

run_compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

cmd_up() {
  bash "${ROOT_DIR}/infra/compose/up.sh"
}

cmd_down() {
  bash "${ROOT_DIR}/infra/compose/down.sh"
}

cmd_status() {
  run_compose ps
}

cmd_logs() {
  if [[ $# -gt 0 ]]; then
    run_compose logs --tail=200 "$@"
  else
    run_compose logs --tail=200
  fi
}

rpc_probe() {
  local name="$1"
  local url="$2"
  local http_code
  local tmp_out
  local tmp_err
  tmp_out="$(mktemp)"
  tmp_err="$(mktemp)"

  http_code=$(curl -sS -m 3 -o "${tmp_out}" -w '%{http_code}' \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    "${url}" 2>"${tmp_err}" || true)
  if [[ "${http_code}" == "200" ]]; then
    echo "PASS rpc:${name} ${url}"
    rm -f "${tmp_out}" "${tmp_err}"
    return 0
  fi
  local err
  err="$(tr -d '\n' < "${tmp_err}" 2>/dev/null | head -c 140)"
  echo "FAIL rpc:${name} ${url} ${err}"
  rm -f "${tmp_out}" "${tmp_err}"
  return 1
}

http_probe() {
  local name="$1"
  local url="$2"
  local code
  local tmp_err
  tmp_err="$(mktemp)"

  code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "${url}" 2>"${tmp_err}" || true)
  if [[ "${code}" =~ ^[23][0-9][0-9]$ ]]; then
    echo "PASS http:${name} ${url} ${code}"
    rm -f "${tmp_err}"
    return 0
  fi
  local err
  err="$(tr -d '\n' < "${tmp_err}" 2>/dev/null | head -c 140)"
  echo "FAIL http:${name} ${url} ${code} ${err}"
  rm -f "${tmp_err}"
  return 1
}

cmd_doctor() {
  local out_dir="${1:-${EVIDENCE_DIR_DEFAULT}}"
  mkdir -p "${out_dir}"
  local log_file="${out_dir}/ghostcontrol-doctor.log"
  local failures=0
  local compose_cfg_err
  local compose_ps_out
  local compose_ps_err

  compose_cfg_err="$(mktemp)"
  compose_ps_out="$(mktemp)"
  compose_ps_err="$(mktemp)"

  {
    echo "# ghostcontrol doctor"
    echo "timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    if command -v docker >/dev/null 2>&1; then
      echo "PASS docker:binary"
      docker --version || true
    else
      echo "FAIL docker:binary missing"
      failures=$((failures + 1))
    fi

    if docker compose -f "${COMPOSE_FILE}" config -q >"${compose_cfg_err}" 2>&1; then
      echo "PASS compose:config ${COMPOSE_FILE}"
    else
      echo "FAIL compose:config ${COMPOSE_FILE}"
      sed 's/^/  /' "${compose_cfg_err}" || true
      failures=$((failures + 1))
    fi

    if run_compose ps >"${compose_ps_out}" 2>"${compose_ps_err}"; then
      echo "PASS compose:ps"
      cat "${compose_ps_out}"
    else
      echo "FAIL compose:ps"
      sed 's/^/  /' "${compose_ps_err}" || true
      failures=$((failures + 1))
    fi

    http_probe "ghostcontrol-api" "http://localhost:7401/health" || failures=$((failures + 1))
    http_probe "ghostcontrol-ui" "http://localhost:7400" || failures=$((failures + 1))
    http_probe "prometheus" "http://localhost:9090/-/healthy" || failures=$((failures + 1))
    http_probe "grafana" "http://localhost:3000/api/health" || failures=$((failures + 1))

    rpc_probe "l1" "http://127.0.0.1:18545" || failures=$((failures + 1))
    rpc_probe "l2" "http://127.0.0.1:29547" || failures=$((failures + 1))
    rpc_probe "l3" "http://127.0.0.1:39545" || failures=$((failures + 1))

    if [[ ${failures} -eq 0 ]]; then
      echo "DOCTOR_STATUS=PASS"
    else
      echo "DOCTOR_STATUS=FAIL failures=${failures}"
    fi
  } > >(tee "${log_file}") 2>&1

  rm -f "${compose_cfg_err}" "${compose_ps_out}" "${compose_ps_err}"
  [[ ${failures} -eq 0 ]]
}

cmd_backup() {
  local out_root="${1:-${EVIDENCE_DIR_DEFAULT}/backups}"
  mkdir -p "${out_root}"
  local stamp
  stamp="$(date -u +"%Y%m%dT%H%M%SZ")"
  local out_file="${out_root}/ghostcontrol-backup-${stamp}.tar.gz"
  tar -czf "${out_file}" \
    -C "${ROOT_DIR}" infra/compose/docker-compose.yml docs
  echo "backup_created=${out_file}"
}

cmd_restore() {
  local archive="${1:-}"
  if [[ -z "${archive}" ]]; then
    echo "usage: ghostcontrol restore <archive.tar.gz>"
    return 2
  fi
  if [[ ! -f "${archive}" ]]; then
    echo "archive_not_found=${archive}"
    return 2
  fi
  tar -xzf "${archive}" -C "${ROOT_DIR}"
  echo "restore_completed=${archive}"
}

usage() {
  cat <<EOF
ghostcontrol commands:
  up                    start ghostcontrol compose stack
  down                  stop ghostcontrol compose stack
  status                show compose service status
  logs [service...]     show recent logs (all or selected services)
  doctor [out_dir]      run baseline checks and write evidence log
  backup [out_dir]      create a backup tarball of ghostcontrol configs/docs
  restore <archive>     restore from a backup tarball
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "${cmd}" in
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    status) cmd_status "$@" ;;
    logs) cmd_logs "$@" ;;
    doctor) cmd_doctor "$@" ;;
    backup) cmd_backup "$@" ;;
    restore) cmd_restore "$@" ;;
    help|-h|--help) usage ;;
    *)
      echo "unknown command: ${cmd}" >&2
      usage
      return 2
      ;;
  esac
}

main "$@"
