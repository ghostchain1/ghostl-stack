#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO_ROOT/ops/ghost-bots"
DST="/opt/ghost-bots"

if [ ! -d "$SRC" ]; then
  echo "missing source directory: $SRC" >&2
  exit 1
fi

sudo mkdir -p "$DST" "$DST/db" "$DST/cache" "$DST/reports"

# Copy code + static assets. Do not copy runtime artifacts.
sudo rsync -a \
  --exclude 'db/incidents.sqlite*' \
  --exclude 'cache/**' \
  --exclude 'reports/**' \
  "$SRC/" "$DST/"

# Ensure runtime dirs exist.
sudo mkdir -p "$DST/db" "$DST/cache" "$DST/reports"

echo "Installed Ghost Bots to $DST"
echo

echo "Next (optional): install systemd units"
echo "  sudo cp $DST/systemd/ghost-bots.service /etc/systemd/system/ghost-bots.service"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now ghost-bots"
echo

echo "Dashboard (optional):"
echo "  python3 $DST/dashboards/server.py --db $DST/db/incidents.sqlite --bind 127.0.0.1 --port 8088"
