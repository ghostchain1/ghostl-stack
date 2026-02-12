#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage:
  launch-system/push-release-to-testnet.sh --release-id <id> --ssh <user@host>

Copies a sealed release bundle to:
  /opt/ghoststack/releases/<release-id>/

Remote safety gates:
- hostname must match TESTNET_HOSTNAME_REGEX (default: 'testnet')
- checksums must validate on remote
USAGE
}

RELEASE_ID=""
SSH_TARGET=""
HOST_RE="testnet"

while [ $# -gt 0 ]; do
  case "$1" in
    --release-id) RELEASE_ID="${2:-}"; shift 2;;
    --ssh) SSH_TARGET="${2:-}"; shift 2;;
    --hostname-regex) HOST_RE="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) die "unknown_arg:$1";;
  esac
done

[ -n "${RELEASE_ID}" ] || die "missing_release_id"
[ -n "${SSH_TARGET}" ] || die "missing_ssh_target"

require_cmd rsync
require_cmd ssh
require_cmd jq

ROOT="$(repo_root)"
REL_DIR="${ROOT}/releases/${RELEASE_ID}"
[ -f "${REL_DIR}/checksums.txt" ] || die "release_not_sealed_missing_checksums:${REL_DIR}"

remote_hostname="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "${SSH_TARGET}" hostname || true)"
printf '%s' "${remote_hostname}" | grep -Eq "${HOST_RE}" || die "remote_hostname_mismatch:${remote_hostname}"

remote_dir="/opt/ghoststack/releases/${RELEASE_ID}"

log "push: rsync -> ${SSH_TARGET}:${remote_dir}"
rsync -a --delete "${REL_DIR}/" "${SSH_TARGET}:${remote_dir}/"

log "push: verify checksums on remote"
ssh -o BatchMode=yes "${SSH_TARGET}" "cd '${remote_dir}' && sha256sum -c checksums.txt >/dev/null"

log "push: install /opt/ghoststack/bin + /opt/ghoststack/dr"
ssh -o BatchMode=yes "${SSH_TARGET}" "set -e\nsudo mkdir -p /opt/ghoststack/bin /opt/ghoststack/dr\nsudo rsync -a '${remote_dir}/dr/' /opt/ghoststack/dr/\ncat > /tmp/deploy-testnet.sh <<'SH'\n#!/usr/bin/env bash\nset -euo pipefail\nrelease_id=\"${1:?usage: deploy-testnet.sh <release-id>}\"\nexec \"/opt/ghoststack/releases/${release_id}/scripts/deploy-testnet.sh\"\nSH\ncat > /tmp/validate-testnet.sh <<'SH'\n#!/usr/bin/env bash\nset -euo pipefail\nrelease_id=\"${1:?usage: validate-testnet.sh <release-id>}\"\nexec \"/opt/ghoststack/releases/${release_id}/scripts/validate-testnet.sh\"\nSH\ncat > /tmp/rollback-testnet.sh <<'SH'\n#!/usr/bin/env bash\nset -euo pipefail\nrelease_id=\"${1:?usage: rollback-testnet.sh <release-id>}\"\nexec \"/opt/ghoststack/releases/${release_id}/scripts/rollback-testnet.sh\"\nSH\nsudo install -m 755 /tmp/deploy-testnet.sh /opt/ghoststack/bin/deploy-testnet.sh\nsudo install -m 755 /tmp/validate-testnet.sh /opt/ghoststack/bin/validate-testnet.sh\nsudo install -m 755 /tmp/rollback-testnet.sh /opt/ghoststack/bin/rollback-testnet.sh\nrm -f /tmp/deploy-testnet.sh /tmp/validate-testnet.sh /tmp/rollback-testnet.sh\n"

log "push: done"
log "push: next on testnet VM: sudo ${remote_dir}/scripts/deploy-testnet.sh"
