#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVICE_FILE="$ROOT_DIR/infra/dns/systemd/ghostdns-ai.service"

cp "$SERVICE_FILE" /etc/systemd/system/ghostdns-ai.service
systemctl daemon-reload
systemctl enable --now ghostdns-ai.service
systemctl status --no-pager ghostdns-ai.service
