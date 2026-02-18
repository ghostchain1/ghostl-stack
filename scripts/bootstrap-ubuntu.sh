#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
fi

if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This bootstrap script currently targets Ubuntu. Detected ID=${ID:-unknown}." >&2
  echo "Proceeding anyway..." >&2
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd sudo
need_cmd curl

echo "[bootstrap] Installing base packages..." >&2
sudo apt-get update -y
sudo apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  build-essential \
  git \
  git-lfs \
  jq

if command -v git-lfs >/dev/null 2>&1; then
  git lfs install >/dev/null 2>&1 || true
fi

echo "[bootstrap] Ensuring Node.js meets repo requirements..." >&2
if command -v node >/dev/null 2>&1; then
  if ! node "${ROOT_DIR}/scripts/node-check.mjs" >/dev/null 2>&1; then
    echo "[bootstrap] Node.js version is out of range; installing Node.js 22.x..." >&2
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  echo "[bootstrap] Node.js not found; installing Node.js 22.x..." >&2
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

node "${ROOT_DIR}/scripts/node-check.mjs"

echo "[bootstrap] Installing Foundry (forge/cast/anvil)..." >&2
if ! command -v forge >/dev/null 2>&1; then
  curl -L https://foundry.paradigm.xyz | bash
fi

export PATH="${HOME}/.foundry/bin:${PATH}"
if command -v foundryup >/dev/null 2>&1; then
  foundryup
fi

if ! command -v forge >/dev/null 2>&1; then
  echo "[bootstrap] forge still not found after installation." >&2
  echo "Try: source ~/.bashrc && foundryup" >&2
  exit 1
fi

# Make Foundry available to non-interactive shells/tools too (optional but convenient).
if sudo -n true 2>/dev/null; then
  sudo ln -sf "${HOME}/.foundry/bin/forge" /usr/local/bin/forge
  sudo ln -sf "${HOME}/.foundry/bin/cast" /usr/local/bin/cast
  sudo ln -sf "${HOME}/.foundry/bin/anvil" /usr/local/bin/anvil
  sudo ln -sf "${HOME}/.foundry/bin/chisel" /usr/local/bin/chisel
  sudo ln -sf "${HOME}/.foundry/bin/foundryup" /usr/local/bin/foundryup
fi

echo "[bootstrap] Versions:" >&2
node -v
npm -v
forge --version

cat <<'EOF'

Next steps:
  1) npm ci
  2) bash dev-stack.sh

LGE dev bring-up:
  - bash scripts/up-liquidity-gravity.sh
  - then follow docs/RUNBOOK.md
EOF
