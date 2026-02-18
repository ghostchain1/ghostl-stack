#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage:
  launch-system/push-release-to-mainnet.sh --release-id <id> --ssh <user@host>

Copies a sealed release bundle to:
  /opt/ghoststack/releases/<release-id>/

Remote safety gates:
- hostname must match MAINNET_HOSTNAME_REGEX (default: 'mainnet')
- checksums must validate on remote

Note:
Mainnet deploy is governance-gated; deploy-mainnet.sh MUST refuse to run unless the on-chain gate authorizes the release.
USAGE
}

RELEASE_ID=""
SSH_TARGET=""
HOST_RE="mainnet"

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
rsync -a --delete --rsync-path="sudo rsync" "${REL_DIR}/" "${SSH_TARGET}:${remote_dir}/"

log "push: verify checksums on remote"
ssh -o BatchMode=yes "${SSH_TARGET}" "cd '${remote_dir}' && sha256sum -c checksums.txt >/dev/null"

log "push: install /opt/ghoststack/bin + /opt/ghoststack/dr"
ssh -o BatchMode=yes "${SSH_TARGET}" "set -e\nsudo mkdir -p /opt/ghoststack/bin /opt/ghoststack/dr\nsudo rsync -a '${remote_dir}/dr/' /opt/ghoststack/dr/\n# Install wrappers\ncat > /tmp/deploy-mainnet.sh <<'SH'\n#!/usr/bin/env bash\nset -euo pipefail\nrelease_id=\"${1:?usage: deploy-mainnet.sh <release-id>}\"\nexec \"/opt/ghoststack/releases/${release_id}/scripts/deploy-mainnet.sh\"\nSH\ncat > /tmp/validate-mainnet.sh <<'SH'\n#!/usr/bin/env bash\nset -euo pipefail\nrelease_id=\"${1:?usage: validate-mainnet.sh <release-id>}\"\nexec \"/opt/ghoststack/releases/${release_id}/scripts/validate-mainnet.sh\"\nSH\ncat > /tmp/rollback-mainnet.sh <<'SH'\n#!/usr/bin/env bash\nset -euo pipefail\nrelease_id=\"${1:?usage: rollback-mainnet.sh <release-id>}\"\nexec \"/opt/ghoststack/releases/${release_id}/scripts/rollback-mainnet.sh\"\nSH\nsudo install -m 755 /tmp/deploy-mainnet.sh /opt/ghoststack/bin/deploy-mainnet.sh\nsudo install -m 755 /tmp/validate-mainnet.sh /opt/ghoststack/bin/validate-mainnet.sh\nsudo install -m 755 /tmp/rollback-mainnet.sh /opt/ghoststack/bin/rollback-mainnet.sh\nrm -f /tmp/deploy-mainnet.sh /tmp/validate-mainnet.sh /tmp/rollback-mainnet.sh\n# Incident response template\nsudo install -m 644 '${remote_dir}/INCIDENT-RESPONSE.md' /opt/ghoststack/bin/INCIDENT-RESPONSE.md\n"

log "push: done"
log "push: next on mainnet VM:"
log "  1) ${remote_dir}/governance/verify-onchain-authorization.sh"
log "  2) sudo RPC_L1=... MAINNET_LAUNCH_GATE_ADDRESS=... ${remote_dir}/scripts/deploy-mainnet.sh"
