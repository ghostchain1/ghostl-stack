#!/usr/bin/env bash
# ==============================================================================
# GhostStack Hypervisor Bootstrap
# Ubuntu 24.04 · KVM/libvirt · nftables
#
# Routing law (non-negotiable from AGENTS.md):
#   GhostL3 → GhostL2 → GhostChain L1
#   L3 → L1 direct: FORBIDDEN (dropped in nftables + virsh net segmentation)
#
# Usage:
#   sudo ./ghoststack_bootstrap.sh
#
# All config is in config/ghoststack.env (copy from ghoststack.env.example first).
# Set DRY_RUN=true to configure everything without starting VMs.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="$SCRIPT_DIR/config/ghoststack.env"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"
LOGFILE="$LOG_DIR/bootstrap-$(date +%Y%m%d-%H%M%S).log"

# Tee all output to log file
exec > >(tee -a "$LOGFILE") 2>&1

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
log()  { echo -e "[ghoststack] $(date '+%H:%M:%S')  $*"; }
info() { echo -e "[ghoststack] \033[36m$*\033[0m"; }
ok()   { echo -e "[ghoststack] \033[32m✓ $*\033[0m"; }
warn() { echo -e "[ghoststack] \033[33m⚠ $*\033[0m"; }
die()  { echo -e "[ghoststack] \033[31mERROR: $*\033[0m" >&2; exit 1; }

require_root() { [[ "$(id -u)" -eq 0 ]] || die "Must run as root (sudo $0)"; }

cmd_exists() { command -v "$1" >/dev/null 2>&1; }

load_env() {
  [[ -f "$CONF_FILE" ]] || die "Config not found: $CONF_FILE\n  cp config/ghoststack.env.example config/ghoststack.env"
  # shellcheck disable=SC1090
  source "$CONF_FILE"
  ok "Config loaded: $CONF_FILE"
}

# ─────────────────────────────────────────────────────────────
# 1. Dependencies
# ─────────────────────────────────────────────────────────────
install_deps() {
  info "» Installing system dependencies..."
  apt-get update -y -q

  local pkgs=(
    qemu-kvm libvirt-daemon-system libvirt-clients virtinst
    nftables jq curl rsync python3 python3-venv
    ca-certificates gnupg lsb-release
  )
  apt-get install -y -q "${pkgs[@]}"

  # Docker
  if ! cmd_exists docker; then
    log "Installing Docker CE..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  systemctl enable --now libvirtd
  systemctl enable --now nftables
  systemctl enable --now docker

  ok "Dependencies ready."
}

# ─────────────────────────────────────────────────────────────
# 2. Libvirt Networks (idempotent)
# ─────────────────────────────────────────────────────────────
gen_net_xml() {
  local name="$1" bridge="$2" gw="$3" dhcp_start="$4" dhcp_end="$5" outfile="$6"
  cat > "$outfile" <<XML
<network>
  <name>${name}</name>
  <bridge name="${bridge}"/>
  <forward mode="nat"/>
  <ip address="${gw}" netmask="255.255.255.0">
    <dhcp>
      <range start="${dhcp_start}" end="${dhcp_end}"/>
    </dhcp>
  </ip>
</network>
XML
}

ensure_net() {
  local name="$1" xml="$2"
  if virsh net-info "$name" >/dev/null 2>&1; then
    log "Network already defined: $name"
  else
    log "Defining network: $name"
    virsh net-define "$xml"
  fi

  if ! virsh net-info "$name" 2>/dev/null | grep -q "Active:.*yes"; then
    virsh net-start "$name"
  fi
  virsh net-autostart "$name" >/dev/null
  ok "Network ready: $name"
}

setup_networks() {
  info "» Configuring libvirt networks (L1/L2/L3/MGMT)..."
  local xml_dir="$SCRIPT_DIR/networks"
  mkdir -p "$xml_dir"

  gen_net_xml "$GS_NET_L1"   "$GS_BR_L1"   "$GS_L1_GW"   "$GS_L1_DHCP_START"   "$GS_L1_DHCP_END"   "$xml_dir/${GS_NET_L1}.xml"
  gen_net_xml "$GS_NET_L2"   "$GS_BR_L2"   "$GS_L2_GW"   "$GS_L2_DHCP_START"   "$GS_L2_DHCP_END"   "$xml_dir/${GS_NET_L2}.xml"
  gen_net_xml "$GS_NET_L3"   "$GS_BR_L3"   "$GS_L3_GW"   "$GS_L3_DHCP_START"   "$GS_L3_DHCP_END"   "$xml_dir/${GS_NET_L3}.xml"
  gen_net_xml "$GS_NET_MGMT" "$GS_BR_MGMT" "$GS_MGMT_GW" "$GS_MGMT_DHCP_START" "$GS_MGMT_DHCP_END" "$xml_dir/${GS_NET_MGMT}.xml"

  ensure_net "$GS_NET_L1"   "$xml_dir/${GS_NET_L1}.xml"
  ensure_net "$GS_NET_L2"   "$xml_dir/${GS_NET_L2}.xml"
  ensure_net "$GS_NET_L3"   "$xml_dir/${GS_NET_L3}.xml"
  ensure_net "$GS_NET_MGMT" "$xml_dir/${GS_NET_MGMT}.xml"

  ok "All networks configured."
}

# ─────────────────────────────────────────────────────────────
# 3. nftables — Routing Law Enforcement
# ─────────────────────────────────────────────────────────────
apply_nftables() {
  info "» Applying nftables routing law..."
  local nft_src="$SCRIPT_DIR/nftables/ghoststack.nft"

  # Render template
  mkdir -p "$SCRIPT_DIR/nftables"
  sed \
    -e "s|{{L1_CIDR}}|${GS_L1_CIDR}|g" \
    -e "s|{{L2_CIDR}}|${GS_L2_CIDR}|g" \
    -e "s|{{L3_CIDR}}|${GS_L3_CIDR}|g" \
    -e "s|{{MGMT_CIDR}}|${GS_MGMT_CIDR}|g" \
    -e "s|{{PROMETHEUS_PORT}}|${PROMETHEUS_PORT}|g" \
    -e "s|{{GRAFANA_PORT}}|${GRAFANA_PORT}|g" \
    -e "s|{{SUPERVISOR_PORT}}|${SUPERVISOR_METRICS_PORT}|g" \
    -e "s|{{WEB_VM_IP}}|${WEB_VM_IP}|g" \
    -e "s|{{EXT_IF}}|${GS_EXT_IF}|g" \
    "$SCRIPT_DIR/nftables/ghoststack.nft.tpl" > "$nft_src"

  mkdir -p /etc/nftables.d
  cp -f "$nft_src" /etc/nftables.d/ghoststack.nft

  # Ensure /etc/nftables.conf includes our ruleset
  if [[ ! -f /etc/nftables.conf ]]; then
    echo 'flush ruleset' > /etc/nftables.conf
  fi
  if ! grep -qF 'include "/etc/nftables.d/ghoststack.nft"' /etc/nftables.conf; then
    echo 'include "/etc/nftables.d/ghoststack.nft"' >> /etc/nftables.conf
  fi

  nft -f /etc/nftables.conf
  systemctl restart nftables
  ok "nftables routing law active."
}

# ─────────────────────────────────────────────────────────────
# 4. VM Start — Strict Layer Order
# ─────────────────────────────────────────────────────────────
vm_exists() { virsh dominfo "$1" >/dev/null 2>&1; }

start_vm() {
  local vm="$1"
  vm_exists "$vm" || die "VM not found in libvirt: $vm\n  Run: virsh list --all"
  local state
  state="$(virsh domstate "$vm" | tr -d '\r')"
  if [[ "$state" == "running" ]]; then
    log "Already running: $vm"
    return 0
  fi
  log "Starting: $vm"
  virsh start "$vm" >/dev/null
  ok "Started: $vm"
}

wait_for_ip() {
  local vm="$1" max_tries="${2:-40}" sleep_s="${3:-3}"
  local ip=""
  log "Waiting for IP from: $vm"
  for ((i=1; i<=max_tries; i++)); do
    ip="$(virsh domifaddr "$vm" 2>/dev/null \
          | grep -Eo '([0-9]{1,3}\.){3}[0-9]{1,3}' \
          | head -n1 || true)"
    [[ -n "$ip" ]] && { echo "$ip"; return 0; }
    sleep "$sleep_s"
  done
  echo ""; return 1
}

rpc_up() {
  local ip="$1" port="$2" name="$3"
  if curl -sS --max-time 3 \
      -H 'Content-Type: application/json' \
      --data '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' \
      "http://${ip}:${port}" >/dev/null 2>&1; then
    ok "RPC responding: $name  (${ip}:${port})"
    return 0
  else
    warn "RPC not yet responding: $name  (${ip}:${port})"
    return 1
  fi
}

start_stack() {
  if [[ "${DRY_RUN:-false}" == "true" ]]; then
    warn "DRY_RUN=true — skipping VM start."
    return 0
  fi

  info "» Starting GhostStack (strict layer order)..."

  # ── Layer 1 ──────────────────────────────────────────────
  info "  Layer 1: Settlement + Validators"
  start_vm "$VM_L1_MAINNET"
  start_vm "$VM_L1_TESTNET"

  start_vm "$VM_L1_VALIDATOR_MAINNET"
  start_vm "$VM_L1_VALIDATOR_TESTNET"
  start_vm "$VM_L1_ARCHIVE"

  # ── Layer 2 ──────────────────────────────────────────────
  info "  Layer 2: OP Stack Sequencers"
  start_vm "$VM_L2_MAINNET"
  start_vm "$VM_L2_TESTNET"

  # ── Layer 3 ──────────────────────────────────────────────
  info "  Layer 3: Utility Rollups"
  start_vm "$VM_L3_MAINNET"
  start_vm "$VM_L3_TESTNET"

  # ── IP + RPC health ──────────────────────────────────────
  info "  Probing RPC endpoints (best-effort)..."
  local ip_l1 ip_l2 ip_l3
  ip_l1="$(wait_for_ip "$VM_L1_MAINNET" 40 3 || true)"
  ip_l2="$(wait_for_ip "$VM_L2_MAINNET" 40 3 || true)"
  ip_l3="$(wait_for_ip "$VM_L3_MAINNET" 40 3 || true)"

  [[ -n "$ip_l1" ]] && rpc_up "$ip_l1" "$RPC_PORT_L1" "L1-mainnet" || true
  [[ -n "$ip_l2" ]] && rpc_up "$ip_l2" "$RPC_PORT_L2" "L2-mainnet" || true
  [[ -n "$ip_l3" ]] && rpc_up "$ip_l3" "$RPC_PORT_L3" "L3-mainnet" || true

  # ── Web Frontend ─────────────────────────────────────────────
  info "  Web Frontend: ${VM_WEB}"
  if vm_exists "$VM_WEB"; then
    start_vm "$VM_WEB"
    local web_ip
    web_ip="$(wait_for_ip "$VM_WEB" 60 3 || true)"
    if [[ -n "$web_ip" ]]; then
      ok "ghost-web VM IP: ${web_ip}"
      [[ "$web_ip" != "$WEB_VM_IP" ]] && \
        warn "Expected ${WEB_VM_IP} but got ${web_ip} — check DHCP reservation."
    else
      warn "ghost-web VM did not report an IP — check cloud-init logs inside VM."
    fi
  else
    warn "VM '${VM_WEB}' not found in libvirt — skipping."
    warn "  See infra/hypervisor/GHOST_WEB_VM.md to create it first."
  fi

  info "  VM state summary:"
  virsh list --all
}

# ─────────────────────────────────────────────────────────────
# 5. Observability Stack (Prometheus + Grafana + Supervisor)
# ─────────────────────────────────────────────────────────────
start_observability() {
  info "» Starting Supervisor + Prometheus + Grafana..."
  local obs_dir="$SCRIPT_DIR/observability"

  (
    cd "$obs_dir"
    docker compose up -d --build
  )

  ok "Grafana:    http://<MGMT-IP>:${GRAFANA_PORT}  (admin / admin)"
  ok "Prometheus: http://<MGMT-IP>:${PROMETHEUS_PORT}"
  ok "Supervisor: http://<MGMT-IP>:${SUPERVISOR_METRICS_PORT}/metrics"
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────
main() {
  require_root
  load_env
  install_deps
  setup_networks
  apply_nftables
  start_observability
  start_stack

  echo ""
  info "══════════════════════════════════════════════════════════"
  ok  "GhostStack bootstrap complete."
  info "══════════════════════════════════════════════════════════"
  echo ""
  log "Log saved to: $LOGFILE"
  log ""
  log "Next steps:"
  log "  1) Create ghost-web VM if it doesn't exist (see infra/hypervisor/GHOST_WEB_VM.md)"
  log "  2) Attach each chain VM NIC to gs-l1 / gs-l2 / gs-l3 (see README.md)"
  log "  3) nft list ruleset           — verify firewall + NAT"
  log "  4) virsh domifaddr <vm>       — confirm IPs"
  log "  5) curl -L http://${WEB_VM_IP}  — verify web VM HTTP"
  log "  6) Open Grafana and confirm health panels"
}

main "$@"
