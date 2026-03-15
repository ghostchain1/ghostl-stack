#!/usr/bin/env bash
# Generate a debug/release keystore for LitVybz Live Android builds.
# Run once before your first local release build.
#
# Usage:
#   ./gen-keystore.sh             # interactive (prompts for passwords)
#   STORE_PASS=secret ./gen-keystore.sh --ci  # non-interactive CI mode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="${SCRIPT_DIR}/mobile/android"
KEY_OUT="${ANDROID_DIR}/app/litvyblive-release.jks"
KEY_PROPS="${ANDROID_DIR}/key.properties"

CI_MODE=false
for arg in "$@"; do [[ "$arg" == "--ci" ]] && CI_MODE=true; done

if [[ -f "${KEY_OUT}" ]]; then
  echo "Keystore already exists at ${KEY_OUT}"
  echo "Delete it first if you want to regenerate."
  exit 0
fi

if $CI_MODE; then
  STORE_PASS="${STORE_PASS:-changeme123}"
  KEY_PASS="${KEY_PASS:-changeme123}"
  KEY_ALIAS="${KEY_ALIAS:-litvyblive}"
  DNAME="CN=LitVybz Live, OU=GhostChain, O=GhostChain, L=Ghost City, ST=Ghost, C=GS"
else
  read -r -p "Store password (min 6 chars): " STORE_PASS
  read -r -p "Key password  (min 6 chars): " KEY_PASS
  KEY_ALIAS="litvyblive"
  DNAME="CN=LitVybz Live, OU=GhostChain, O=GhostChain, L=Ghost City, ST=Ghost, C=GS"
fi

keytool -genkeypair \
  -v \
  -keystore "${KEY_OUT}" \
  -alias "${KEY_ALIAS}" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -storepass "${STORE_PASS}" \
  -keypass "${KEY_PASS}" \
  -dname "${DNAME}"

cat > "${KEY_PROPS}" <<EOF
storePassword=${STORE_PASS}
keyPassword=${KEY_PASS}
keyAlias=${KEY_ALIAS}
storeFile=litvyblive-release.jks
EOF

chmod 600 "${KEY_PROPS}" "${KEY_OUT}"

echo ""
echo "✓ Keystore: ${KEY_OUT}"
echo "✓ key.properties: ${KEY_PROPS}"
echo ""
echo "IMPORTANT: Back up ${KEY_OUT} securely."
echo "Never commit it to git — it is in .gitignore."
echo ""
echo "For CI, set these GitHub Actions secrets:"
echo "  ANDROID_KEYSTORE_BASE64  = \$(base64 -w0 ${KEY_OUT})"
echo "  ANDROID_STORE_PASSWORD   = ${STORE_PASS}"
echo "  ANDROID_KEY_PASSWORD     = ${KEY_PASS}"
echo "  ANDROID_KEY_ALIAS        = ${KEY_ALIAS}"
