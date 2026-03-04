#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# inventory.sh — Canonical GhostChain KVM VM inventory for the gs-mgmt network
#
# SOURCE this file; do not execute it directly.
#   source "$(dirname "${BASH_SOURCE[0]}")/inventory.sh"
#
# Consumers:
#   create-vms.sh          — sources this for GS_MGMT_NETWORK and IP_* via vm_ip()
#   push-to-vm.sh          — sources this for IP_*, vm_ip(), preflight_virsh(), preflight_ssh()
#   inject-devnet-key.sh   — sources this for ALL_VMS and vm_ip()
#
# NOTE: Bash arrays (ALL_VMS) cannot be exported via the environment.
# They are available in any script that sources this file, but are NOT
# inherited by subprocesses.  Use «source inventory.sh» rather than
# trying to export ALL_VMS.
# ─────────────────────────────────────────────────────────────────────────────

# ── Network ───────────────────────────────────────────────────────────────────
# Exported so callers that source this file (create-vms.sh, push-to-vm.sh) can
# reference these instead of hardcoding the literal values.
export GS_MGMT_NETWORK="gs-mgmt"
export GS_MGMT_CIDR="10.50.99.0/24"
export GS_MGMT_GW="10.50.99.1"

# ── Canonical IP assignments ──────────────────────────────────────────────────
# Naming convention: IP_<vm-name with dashes→underscores>
#
# NOTE: These variables appear "unused" to static analysers (shellcheck SC2034)
# because they are accessed via Bash indirect expansion inside vm_ip():
#   local var="IP_${name//-/_}"; echo "${!var}"
# They are exported so they survive into subshells when this file is sourced.
export IP_ghost_web="10.50.99.10"
export IP_ghost_dns_slave="10.50.99.66"
export IP_ghostchain_devnet="10.50.99.45"

# GhostChain L1 node VMs (container → VM lift-and-shift)
export IP_ghostchain_web="10.50.99.10"          # alias: same host as ghost-web
export IP_ghost_ghostchain_bootnode_1="10.50.99.20"
export IP_ghost_ghostchain_node1_1="10.50.99.21"
export IP_ghost_ghostchain_node2_1="10.50.99.22"

# GNS (Ghost Name Service) VM fleet
export IP_gns_bind9="10.50.99.30"
export IP_gns_kea="10.50.99.31"          # kea-ctrl-agent + kea-dhcp4 + kea-ddns co-located
export IP_gns_postgres="10.50.99.32"
export IP_gns_indexer="10.50.99.33"
export IP_gns_api="10.50.99.34"

export IP_ghostchain_mainnet_l1="10.50.99.70"
export IP_ghostchain_testnet_l1="10.50.99.71"
export IP_ghost_mainnet_validator="10.50.99.72"
export IP_ghost_testnet_validator="10.50.99.73"

export IP_ghostl2_mainnet="10.50.99.76"
export IP_ghostl2_testnet="10.50.99.77"
export IP_ghostl3_mainnet="10.50.99.78"
export IP_ghostl3_testnet="10.50.99.79"

# ── Ordered VM list (infrastructure → testnet → mainnet) ─────────────────────
# Used for boot ordering, preflight checks, and validation loops.
ALL_VMS=(
  # ── Infra / frontend ──────────────────────────────────────────────────────
  ghost-web
  ghost-dns-slave
  # ── GhostChain L1 node cluster ────────────────────────────────────────────
  ghost-ghostchain-bootnode-1
  ghost-ghostchain-node1-1
  ghost-ghostchain-node2-1
  # ── GNS fleet ─────────────────────────────────────────────────────────────
  gns-bind9
  gns-kea
  gns-postgres
  gns-indexer
  gns-api
  # ── Devnet / testnet / mainnet ────────────────────────────────────────────
  ghostchain-devnet
  ghostchain-testnet-l1
  ghost-testnet-validator
  ghostl2-testnet
  ghostl3-testnet
  ghostchain-mainnet-l1
  ghost-mainnet-validator
  ghostl2-mainnet
  ghostl3-mainnet
)

# ── Remote VM list — same as ALL_VMS but WITHOUT ghostchain-devnet ────────────
# Use REMOTE_VMS in scripts that run FROM ghostchain-devnet so they never
# SSH into themselves or call virsh on their own domain.
REMOTE_VMS=(
  ghost-web
  ghost-dns-slave
  ghost-ghostchain-bootnode-1
  ghost-ghostchain-node1-1
  ghost-ghostchain-node2-1
  gns-bind9
  gns-kea
  gns-postgres
  gns-indexer
  gns-api
  ghostchain-testnet-l1
  ghost-testnet-validator
  ghostl2-testnet
  ghostl3-testnet
  ghostchain-mainnet-l1
  ghost-mainnet-validator
  ghostl2-mainnet
  ghostl3-mainnet
)

# ── IP lookup function ────────────────────────────────────────────────────────
# Translates a VM name to its static IP via Bash indirect variable expansion.
# Pattern: "ghostchain-mainnet-l1" → var="IP_ghostchain_mainnet_l1" → ${!var}
# This is the *only* consumer of the IP_* variables above; static analysers
# that don't trace ${!var} expansions will falsely report them as unused.
#
# Usage: ip=$(vm_ip ghostl2-testnet)
vm_ip() {
  local name="$1"
  local var="IP_${name//-/_}"
  echo "${!var:-}"
}

# ── Preflight: verify VMs exist in libvirt ────────────────────────────────────
# Usage: preflight_virsh vm1 vm2 ...
# Returns 1 (and lists missing VMs) if any are not defined.
#
# NOTE: When running from ghostchain-devnet (VM 45) or any non-hypervisor host,
# virsh will not be installed.  In that case this check is skipped with a
# warning — SSH reachability (preflight_ssh) is sufficient from the outside.
preflight_virsh() {
  if ! command -v virsh &>/dev/null; then
    echo "[preflight] virsh not found — skipping libvirt domain check (not on hypervisor)"
    return 0
  fi
  local missing=()
  for name in "$@"; do
    if ! virsh dominfo "$name" &>/dev/null; then
      missing+=("$name")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "[preflight] ERROR: the following VMs are not defined in libvirt:"
    printf '  %s\n' "${missing[@]}"
    echo "[preflight] Run create-vms.sh first, or check VIRSH_URI."
    return 1
  fi
  return 0
}

# ── Preflight: verify VMs are reachable via SSH ───────────────────────────────
# Usage: preflight_ssh ghost@10.50.99.71 ghost@10.50.99.73 ...
# Returns 1 (and lists unreachable hosts) if any fail.
preflight_ssh() {
  local user_host key_arg=()
  local failed=()
  local ssh_key="${SSH_KEY:-}"
  [ -n "$ssh_key" ] && key_arg=(-i "$ssh_key")
  local opts=(-o StrictHostKeyChecking=no -o ConnectTimeout=6 -o BatchMode=yes)

  for user_host in "$@"; do
    if ! ssh "${opts[@]}" "${key_arg[@]}" "$user_host" "true" &>/dev/null; then
      failed+=("$user_host")
    fi
  done
  if [ "${#failed[@]}" -gt 0 ]; then
    echo "[preflight] ERROR: SSH unreachable:"
    printf '  %s\n' "${failed[@]}"
    echo "[preflight] Check your SSH key (SSH_KEY env) and that VMs are booted."
    return 1
  fi
  return 0
}
