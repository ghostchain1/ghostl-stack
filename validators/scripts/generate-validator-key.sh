#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#
#   GhostStack Validator Key Generator
#   Generates a cryptographically secure 32-byte validator identity key.
#
#   Usage:
#       bash generate-validator-key.sh [validator-index] [--label NAME]
#
#   Output:
#       validators/keys/validator-<index>-<timestamp>.key  (hex, chmod 600)
#       validators/keys/validator-<index>-<timestamp>.meta (JSON metadata)
#
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GHOST_HOME="/home/${SUDO_USER:-${USER:-ghost}}"
STACK_DIR="${GHOST_HOME}/ghostl-stack"
KEYS_DIR="${STACK_DIR}/validators/keys"
LOG_FILE="${STACK_DIR}/logs/key-generation.log"

mkdir -p "$KEYS_DIR" "$(dirname "$LOG_FILE")"

# ── args ───────────────────────────────────────────────────────────────────
INDEX="${1:-1}"
LABEL=""
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
    case "$1" in
        --label) shift; LABEL="${1:-}" ;;
        *) ;;
    esac
    shift
done

TIMESTAMP=$(date +%Y%m%d%H%M%S)
[[ -z "$LABEL" ]] && LABEL="validator-$(printf '%02d' "$INDEX")"
KEY_FILE="${KEYS_DIR}/${LABEL}-${TIMESTAMP}.key"
META_FILE="${KEYS_DIR}/${LABEL}-${TIMESTAMP}.meta"

# ── guard: don't overwrite ────────────────────────────────────────────────
if compgen -G "${KEYS_DIR}/${LABEL}-*.key" > /dev/null 2>&1; then
    EXISTING=$(compgen -G "${KEYS_DIR}/${LABEL}-*.key" | head -1)
    echo "Key already exists for ${LABEL}: ${EXISTING}" | tee -a "$LOG_FILE"
    echo "KEY_FILE=${EXISTING}"
    exit 0
fi

# ── generate ──────────────────────────────────────────────────────────────
RAW_KEY=$(openssl rand -hex 32)
echo "$RAW_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"

# Derive a short public identifier (first 8 bytes of SHA256 of the key)
KEY_ID=$(echo -n "$RAW_KEY" | sha256sum | head -c 16)

# Write JSON metadata alongside the key
cat > "$META_FILE" << METAEOF
{
  "label":      "${LABEL}",
  "index":      ${INDEX},
  "key_id":     "0x${KEY_ID}",
  "key_file":   "${KEY_FILE}",
  "generated":  "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "algorithm":  "secp256k1-compatible random seed",
  "chain_id":   1337
}
METAEOF
chmod 600 "$META_FILE"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Generated key: ${KEY_FILE} (id=${KEY_ID})" \
    >> "$LOG_FILE"

echo "Validator key generated:"
echo "  Label  : ${LABEL}"
echo "  Key ID : 0x${KEY_ID}"
echo "  File   : ${KEY_FILE}"
echo "  Meta   : ${META_FILE}"
echo ""
echo "KEY_FILE=${KEY_FILE}"
