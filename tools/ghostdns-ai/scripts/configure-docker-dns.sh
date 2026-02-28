#!/usr/bin/env bash
set -euo pipefail

DAEMON_JSON=/etc/docker/daemon.json
BACKUP_DIR=/var/backups/ghostdns
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

if [[ -f "$DAEMON_JSON" ]]; then
  cp "$DAEMON_JSON" "$BACKUP_DIR/daemon.json.$TS.bak"
fi

python3 - <<'PY'
import json
from pathlib import Path

path = Path('/etc/docker/daemon.json')
payload = {}
if path.exists():
    payload = json.loads(path.read_text(encoding='utf-8'))
payload['dns'] = ['127.0.0.1']
path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
PY

systemctl restart docker
systemctl is-active --quiet docker

echo "docker_dns_set_to_localhost"
