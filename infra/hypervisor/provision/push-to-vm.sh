#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# push-to-vm.sh — GhostChain devnet → testnet → mainnet promotion
#
# Run FROM the devnet VM (VM 45, 10.50.99.45) or any host with SSH access.
#
# Promotion flow:
#   devnet (VM 45)  ──promote──▶  testnet (VMs 71/73/77/79)
#   testnet         ──promote──▶  mainnet (VMs 70/72/76/78)
#
# What gets promoted:
#   • All provision scripts (infra/hypervisor/provision/*.sh)
#   • Contract deployment artifacts (contracts/deployments/)
#   • Chain config (chains/l2/rollup.json, chains/l3/rollup.json)
#   • Extracted contract addresses injected into each VM's env file
#
# Usage:
#   ./push-to-vm.sh --target testnet              # devnet → testnet all layers
#   ./push-to-vm.sh --target mainnet              # testnet → mainnet all layers
#   ./push-to-vm.sh --target testnet --layer l2   # testnet L2 only
#   ./push-to-vm.sh --target mainnet --layer l1   # mainnet L1 only (both nodes)
#   ./push-to-vm.sh --provision-only              # re-run provision, no artifact push
#   ./push-to-vm.sh --dry-run --target testnet    # print actions, no SSH
#
# SSH key: defaults to ~/.ssh/ghostchain_deploy (override with SSH_KEY env var).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
TARGET=""          # testnet | mainnet
LAYER="all"        # all | l1 | l2 | l3
DRY_RUN=0
PROVISION_ONLY=0
RESTART=1
SSH_USER="${SSH_USER:-ghost}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/ghostchain_deploy}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"

# ── VM IP map ─────────────────────────────────────────────────────────────────
declare -A VM_IP=(
  [devnet]="10.50.99.45"
  [dns_slave]="10.50.99.66"
  [mainnet_l1]="10.50.99.70"
  [testnet_l1]="10.50.99.71"
  [mainnet_validator]="10.50.99.72"
  [testnet_validator]="10.50.99.73"
  [mainnet_l2]="10.50.99.76"
  [testnet_l2]="10.50.99.77"
  [mainnet_l3]="10.50.99.78"
  [testnet_l3]="10.50.99.79"
  [ghost_web]="10.50.99.10"
)

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)      TARGET="$2";         shift 2 ;;
    --layer)       LAYER="$2";          shift 2 ;;
    --dry-run)     DRY_RUN=1;           shift   ;;
    --no-restart)  RESTART=0;           shift   ;;
    --provision-only) PROVISION_ONLY=1; shift   ;;
    --ssh-key)     SSH_KEY="$2";        shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "Usage: $0 --target testnet|mainnet [--layer all|l1|l2|l3] [--dry-run] [--no-restart]"
  exit 1
fi

PROVISION_DIR="$REPO_DIR/infra/hypervisor/provision"
DEPLOY_DIR="$REPO_DIR/contracts/deployments/ghostl2"

log() { echo "[push-to-vm] $(date -u +%H:%M:%SZ) $*"; }
die() { log "ERROR: $*"; exit 1; }

ssh_run() {
  local ip="$1"; shift
  if [ "$DRY_RUN" = "1" ]; then
    log "[DRY-RUN] ssh ${SSH_USER}@${ip} → $*"
    return 0
  fi
  # shellcheck disable=SC2086
  ssh $SSH_OPTS -i "$SSH_KEY" "${SSH_USER}@${ip}" "$@"
}

scp_push() {
  local src="$1" ip="$2" dst="$3"
  if [ "$DRY_RUN" = "1" ]; then
    log "[DRY-RUN] scp ${src} → ${SSH_USER}@${ip}:${dst}"
    return 0
  fi
  # shellcheck disable=SC2086
  scp $SSH_OPTS -i "$SSH_KEY" "$src" "${SSH_USER}@${ip}:${dst}"
}

# ── Contract address extractor ────────────────────────────────────────────────
# Reads a JSON deployment file and emits KEY=VALUE for a given address field.
extract_addr() {
  local file="$1" key="$2" envvar="$3"
  if [ -f "$file" ]; then
    local val
    val=$(python3 -c "import json,sys; d=json.load(open('$file')); print(d.get('address','') or d.get('$key',''))" 2>/dev/null || echo "")
    if [ -n "$val" ] && [ "$val" != "None" ]; then
      echo "${envvar}=${val}"
    fi
  fi
}

# ── Build promoted address map from devnet deployments ────────────────────────
build_addr_env() {
  local env_out=""
  local deployments="$DEPLOY_DIR"

  [ -d "$deployments" ] || { log "WARNING: $deployments not found; skipping address injection"; return; }

  # L2 contracts
  env_out+="$(extract_addr "$deployments/L2OutputOracle.json"           address L2_OUTPUT_ORACLE_ADDRESS)
"
  env_out+="$(extract_addr "$deployments/L2ToL1MessagePasser.json"      address L2_TO_L1_MESSAGE_PASSER)
"
  env_out+="$(extract_addr "$deployments/OptimismPortal.json"           address OPTIMISM_PORTAL_ADDRESS)
"
  env_out+="$(extract_addr "$deployments/L1CrossDomainMessenger.json"   address L1_XDOMAIN_MESSENGER)
"
  env_out+="$(extract_addr "$deployments/L1StandardBridge.json"         address L1_STANDARD_BRIDGE)
"
  env_out+="$(extract_addr "$deployments/SystemConfig.json"             address SYSTEM_CONFIG_ADDRESS)
"
  # L3 contracts (deployed on L2)
  env_out+="$(extract_addr "$deployments/L3OutputOracle.json"           address L3_OUTPUT_ORACLE_ADDRESS)
"
  env_out+="$(extract_addr "$deployments/L2Rollup.json"                 address L2_ROLLUP_L3_ADDRESS)
"
  # Economy / Gov
  env_out+="$(extract_addr "$deployments/GovernorL1.json"               address GOVERNOR_L1)
"
  env_out+="$(extract_addr "$deployments/GasToken.json"                 address GAS_TOKEN)
"
  env_out+="$(extract_addr "$deployments/FinalityOracleL1.json"         address L1_FINALITY_ORACLE_ADDRESS)
"
  env_out+="$(extract_addr "$deployments/FinalityOracleL2.json"         address L2_FINALITY_ORACLE_ADDRESS)
"
  env_out+="$(extract_addr "$deployments/FinalityOracleL3.json"         address L3_FINALITY_ORACLE_ADDRESS)
"

  printf '%s' "$env_out" | grep -v '^$' || true
}

# ── Inject promoted addresses into a remote env file ─────────────────────────
inject_addrs() {
  local ip="$1" env_file="$2" addr_block="$3"
  if [ -z "$addr_block" ]; then
    log "  No addresses to inject."
    return
  fi
  log "  Injecting promoted addresses into ${env_file} on ${ip}..."
  if [ "$DRY_RUN" = "1" ]; then
    log "[DRY-RUN] would inject:"
    echo "$addr_block" | sed 's/^/    /'
    return
  fi
  # Append or update each KEY=VALUE in the remote env file
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local key val
    key="${line%%=*}"
    val="${line#*=}"
    ssh_run "$ip" bash -c "
      if grep -q '^${key}=' ${env_file} 2>/dev/null; then
        sed -i 's|^${key}=.*|${key}=${val}|' ${env_file}
      else
        echo '${key}=${val}' >> ${env_file}
      fi
    "
  done <<< "$addr_block"
}

# ── Push provision scripts to a VM ────────────────────────────────────────────
push_scripts() {
  local ip="$1"
  log "  Pushing provision scripts to ${ip}..."
  ssh_run "$ip" "mkdir -p /tmp/ghostchain-provision"
  for f in "$PROVISION_DIR"/*.sh; do
    scp_push "$f" "$ip" "/tmp/ghostchain-provision/$(basename "$f")"
  done
  ssh_run "$ip" "chmod +x /tmp/ghostchain-provision/*.sh"
}

# ── Push rollup.json files ─────────────────────────────────────────────────────
push_rollup_json() {
  local ip="$1" layer="$2"
  local src="$REPO_DIR/chains/${layer}/rollup.json"
  if [ -f "$src" ]; then
    log "  Pushing ${layer}/rollup.json to ${ip}..."
    ssh_run "$ip" "mkdir -p /etc/ghostl-stack"
    scp_push "$src" "$ip" "/etc/ghostl-stack/${layer}-rollup.json"
    ssh_run "$ip" "chmod 644 /etc/ghostl-stack/${layer}-rollup.json"
  else
    log "  WARNING: ${src} not found; skipping rollup.json push"
  fi
}

# ── Restart a service on a remote VM ─────────────────────────────────────────
restart_svc() {
  local ip="$1" svc="$2"
  if [ "$RESTART" = "1" ]; then
    log "  Restarting ${svc} on ${ip}..."
    ssh_run "$ip" "sudo systemctl restart ${svc} || sudo systemctl start ${svc}"
  else
    log "  (no-restart) ${svc} on ${ip} — restart manually"
  fi
}

# ── Wait for an RPC endpoint to respond ──────────────────────────────────────
wait_rpc() {
  local name="$1" url="$2" retries="${3:-30}"
  log "  Waiting for ${name} at ${url}..."
  local i=0
  while [ "$i" -lt "$retries" ]; do
    if curl -sSf --max-time 4 -X POST "$url" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
        2>/dev/null | grep -q '"result"'; then
      log "  UP  ${name}"
      return 0
    fi
    sleep 5
    (( i++ )) || true
  done
  log "  WARN ${name} not responding after $(( retries * 5 ))s — continuing"
}

# ── Main promotion logic ──────────────────────────────────────────────────────
ADDR_BLOCK=""
if [ "$PROVISION_ONLY" = "0" ]; then
  log "Building promoted address map from devnet deployments..."
  ADDR_BLOCK="$(build_addr_env)"
  if [ -z "$ADDR_BLOCK" ]; then
    log "WARNING: No deployed contract addresses found in $DEPLOY_DIR"
    log "         Run contract deployment on devnet first, then re-run this script."
  else
    log "Addresses to promote:"
    echo "$ADDR_BLOCK" | sed 's/^/  /'
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# TESTNET promotion (devnet → testnet VMs 71/73/77/79)
# ════════════════════════════════════════════════════════════════════════════
if [ "$TARGET" = "testnet" ]; then
  log "═══ PROMOTING TO TESTNET ════════════════════════════════════════════"

  # ── L1 testnet (fullnode VM 71 + validator VM 73) ─────────────────────────
  if [[ "$LAYER" = "all" || "$LAYER" = "l1" ]]; then
    for vm_key in testnet_l1 testnet_validator; do
      ip="${VM_IP[$vm_key]}"
      role="fullnode"; [ "$vm_key" = "testnet_validator" ] && role="validator"
      svc="ghostl1-testnet-${role}"
      log "── L1 testnet ${role} (${ip}) ───────────────────────────────────────"

      push_scripts "$ip"

      if [ "$PROVISION_ONLY" = "0" ]; then
        log "  Running L1 provision on ${ip}..."
        ssh_run "$ip" "sudo ENV=testnet ROLE=${role} bash /tmp/ghostchain-provision/ghostchain-l1-provision.sh --update"
        inject_addrs "$ip" "/etc/ghostl-stack/l1-testnet-${role}.env" "$ADDR_BLOCK"
      fi

      restart_svc "$ip" "$svc"
    done

    # Wait for testnet L1 before continuing up the stack
    if [ "$DRY_RUN" = "0" ]; then
      wait_rpc "testnet-L1" "http://${VM_IP[testnet_l1]}:18545"
    fi
  fi

  # ── L2 testnet (VM 77) ────────────────────────────────────────────────────
  if [[ "$LAYER" = "all" || "$LAYER" = "l2" ]]; then
    ip="${VM_IP[testnet_l2]}"
    svc="ghostl2-testnet"
    log "── L2 testnet (${ip}) ──────────────────────────────────────────────"

    push_scripts "$ip"
    push_rollup_json "$ip" "l2"

    if [ "$PROVISION_ONLY" = "0" ]; then
      log "  Running L2 provision on ${ip}..."
      ssh_run "$ip" "sudo ENV=testnet bash /tmp/ghostchain-provision/ghostl2-provision.sh --update"
      inject_addrs "$ip" "/etc/ghostl-stack/l2-testnet.env" "$ADDR_BLOCK"
    fi

    restart_svc "$ip" "$svc"

    if [ "$DRY_RUN" = "0" ]; then
      wait_rpc "testnet-L2" "http://${VM_IP[testnet_l2]}:29547"
    fi
  fi

  # ── L3 testnet (VM 79) ────────────────────────────────────────────────────
  if [[ "$LAYER" = "all" || "$LAYER" = "l3" ]]; then
    ip="${VM_IP[testnet_l3]}"
    svc="ghostl3-testnet"
    log "── L3 testnet (${ip}) ──────────────────────────────────────────────"

    push_scripts "$ip"
    push_rollup_json "$ip" "l3"

    if [ "$PROVISION_ONLY" = "0" ]; then
      log "  Running L3 provision on ${ip}..."
      ssh_run "$ip" "sudo ENV=testnet bash /tmp/ghostchain-provision/ghostl3-provision.sh --update"
      inject_addrs "$ip" "/etc/ghostl-stack/l3-testnet.env" "$ADDR_BLOCK"
    fi

    restart_svc "$ip" "$svc"
  fi

  log "═══ TESTNET PROMOTION COMPLETE ══════════════════════════════════════"
  log ""
  log "  Testnet L1  : http://${VM_IP[testnet_l1]}:18545"
  log "  Testnet L2  : http://${VM_IP[testnet_l2]}:29547"
  log "  Testnet L3  : http://${VM_IP[testnet_l3]}:39545"
  log ""
  log "  Run health checks:"
  log "    ssh ghost@${VM_IP[testnet_l1]} sudo /usr/local/bin/ghostl1-testnet-fullnode-health"
  log "    ssh ghost@${VM_IP[testnet_l2]} sudo /usr/local/bin/ghostl2-testnet-health"
  log "    ssh ghost@${VM_IP[testnet_l3]} sudo /usr/local/bin/ghostl3-testnet-health"
fi

# ════════════════════════════════════════════════════════════════════════════
# MAINNET promotion (testnet QA passed → mainnet VMs 70/72/76/78)
# ════════════════════════════════════════════════════════════════════════════
if [ "$TARGET" = "mainnet" ]; then
  log "═══ PROMOTING TO MAINNET ════════════════════════════════════════════"
  log "WARNING: This will restart production mainnet services. Ctrl-C now to abort."
  sleep 5

  # ── L1 mainnet (fullnode VM 70 + validator VM 72) ─────────────────────────
  if [[ "$LAYER" = "all" || "$LAYER" = "l1" ]]; then
    for vm_key in mainnet_l1 mainnet_validator; do
      ip="${VM_IP[$vm_key]}"
      role="fullnode"; [ "$vm_key" = "mainnet_validator" ] && role="validator"
      svc="ghostl1-mainnet-${role}"
      log "── L1 mainnet ${role} (${ip}) ──────────────────────────────────────"

      push_scripts "$ip"

      if [ "$PROVISION_ONLY" = "0" ]; then
        log "  Running L1 provision on ${ip}..."
        ssh_run "$ip" "sudo ENV=mainnet ROLE=${role} bash /tmp/ghostchain-provision/ghostchain-l1-provision.sh --update"
        inject_addrs "$ip" "/etc/ghostl-stack/l1-mainnet-${role}.env" "$ADDR_BLOCK"
      fi

      restart_svc "$ip" "$svc"
    done

    if [ "$DRY_RUN" = "0" ]; then
      wait_rpc "mainnet-L1" "http://${VM_IP[mainnet_l1]}:18545"
    fi
  fi

  # ── L2 mainnet (VM 76) ────────────────────────────────────────────────────
  if [[ "$LAYER" = "all" || "$LAYER" = "l2" ]]; then
    ip="${VM_IP[mainnet_l2]}"
    svc="ghostl2-mainnet"
    log "── L2 mainnet (${ip}) ──────────────────────────────────────────────"

    push_scripts "$ip"
    push_rollup_json "$ip" "l2"

    if [ "$PROVISION_ONLY" = "0" ]; then
      log "  Running L2 provision on ${ip}..."
      ssh_run "$ip" "sudo ENV=mainnet bash /tmp/ghostchain-provision/ghostl2-provision.sh --update"
      inject_addrs "$ip" "/etc/ghostl-stack/l2-mainnet.env" "$ADDR_BLOCK"
    fi

    restart_svc "$ip" "$svc"

    if [ "$DRY_RUN" = "0" ]; then
      wait_rpc "mainnet-L2" "http://${VM_IP[mainnet_l2]}:29547"
    fi
  fi

  # ── L3 mainnet (VM 78) ────────────────────────────────────────────────────
  if [[ "$LAYER" = "all" || "$LAYER" = "l3" ]]; then
    ip="${VM_IP[mainnet_l3]}"
    svc="ghostl3-mainnet"
    log "── L3 mainnet (${ip}) ──────────────────────────────────────────────"

    push_scripts "$ip"
    push_rollup_json "$ip" "l3"

    if [ "$PROVISION_ONLY" = "0" ]; then
      log "  Running L3 provision on ${ip}..."
      ssh_run "$ip" "sudo ENV=mainnet bash /tmp/ghostchain-provision/ghostl3-provision.sh --update"
      inject_addrs "$ip" "/etc/ghostl-stack/l3-mainnet.env" "$ADDR_BLOCK"
    fi

    restart_svc "$ip" "$svc"
  fi

  log "═══ MAINNET PROMOTION COMPLETE ══════════════════════════════════════"
  log ""
  log "  Mainnet L1  : http://${VM_IP[mainnet_l1]}:18545"
  log "  Mainnet L2  : http://${VM_IP[mainnet_l2]}:29547"
  log "  Mainnet L3  : http://${VM_IP[mainnet_l3]}:39545"
  log ""
  log "  Run health checks:"
  log "    ssh ghost@${VM_IP[mainnet_l1]} sudo /usr/local/bin/ghostl1-mainnet-fullnode-health"
  log "    ssh ghost@${VM_IP[mainnet_l2]} sudo /usr/local/bin/ghostl2-mainnet-health"
  log "    ssh ghost@${VM_IP[mainnet_l3]} sudo /usr/local/bin/ghostl3-mainnet-health"
fi
