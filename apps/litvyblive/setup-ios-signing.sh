#!/usr/bin/env bash
# ┌──────────────────────────────────────────────────────────────────────────┐
# │  LitVybz Live — iOS Signing & CI Setup                                  │
# │                                                                          │
# │  Sets all GitHub repository vars + secrets required for the signed IPA  │
# │  workflow, then optionally triggers the build.                           │
# │                                                                          │
# │  Prerequisites:                                                          │
# │    • gh CLI authenticated (gh auth status)                               │
# │    • Apple Distribution .p12 cert file                                   │
# │    • Apple .mobileprovision provisioning profile                         │
# │    • Firebase GoogleService-Info.plist (real, from Firebase console)     │
# │    • Android keystore (run gen-keystore.sh if not done yet)              │
# │                                                                          │
# │  Usage:                                                                  │
# │    chmod +x setup-ios-signing.sh                                         │
# │    ./setup-ios-signing.sh                          # interactive         │
# │    ./setup-ios-signing.sh --trigger                # set + start build   │
# │    ./setup-ios-signing.sh --vars-only              # vars only, no sigs  │
# │    ./setup-ios-signing.sh --dry-run                # print, don't set    │
# └──────────────────────────────────────────────────────────────────────────┘

set -euo pipefail

REPO="ghostchain1/ghostl-stack"
WORKFLOW_FILE="litvyblive-mobile.yml"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="${SCRIPT_DIR}/mobile"
ANDROID_DIR="${MOBILE_DIR}/android"

# ── Flags ─────────────────────────────────────────────────────────────────────
DO_TRIGGER=false
VARS_ONLY=false
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --trigger)   DO_TRIGGER=true ;;
    --vars-only) VARS_ONLY=true ;;
    --dry-run)   DRY_RUN=true ;;
    --help|-h)
      sed -n '/^# ┌/,/^# └/p' "$0"
      exit 0
      ;;
  esac
done

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[ios-setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ios-setup]${NC} $*"; }
error() { echo -e "${RED}[ios-setup]${NC} $*" >&2; exit 1; }
step()  { echo -e "\n${CYAN}▶ $*${NC}"; }

# ── Validate gh CLI ────────────────────────────────────────────────────────────
step "Checking prerequisites"
command -v gh >/dev/null 2>&1 || error "gh CLI not found. Install from https://cli.github.com"
gh auth status >/dev/null 2>&1 || error "Not authenticated. Run: gh auth login"
info "gh CLI: $(gh --version | head -1)"
info "Repo:   ${REPO}"

# ── Helper: set repo variable ─────────────────────────────────────────────────
set_var() {
  local name="$1" value="$2"
  if $DRY_RUN; then
    echo "  [DRY-RUN] gh variable set ${name} --repo ${REPO} --body <value>"
  else
    gh variable set "${name}" --repo "${REPO}" --body "${value}"
    info "  ✓ Variable: ${name}"
  fi
}

# ── Helper: set repo secret ───────────────────────────────────────────────────
set_secret() {
  local name="$1" value="$2"
  if $DRY_RUN; then
    echo "  [DRY-RUN] gh secret set ${name} --repo ${REPO}"
  else
    printf '%s' "${value}" | gh secret set "${name}" --repo "${REPO}"
    info "  ✓ Secret:   ${name}"
  fi
}

# ── Helper: prompt for file path with validation ──────────────────────────────
prompt_file() {
  local prompt="$1" var_name="$2"
  local path=""
  while true; do
    read -r -p "  ${prompt}: " path
    path="${path/#\~/$HOME}"   # expand ~
    if [[ -f "$path" ]]; then
      printf -v "$var_name" '%s' "$path"
      return
    fi
    warn "File not found: $path  — try again (or Ctrl-C to abort)"
  done
}

# ── Helper: prompt for value (can be empty if optional) ──────────────────────
prompt_val() {
  local prompt="$1" var_name="$2" default="${3:-}"
  local val=""
  read -r -p "  ${prompt}${default:+ [${default}]}: " val
  printf -v "$var_name" '%s' "${val:-$default}"
}

# ═══════════════════════════════════════════════════════════════════════════════
# PART 1 — Repository Variables (public, not encrypted)
# ═══════════════════════════════════════════════════════════════════════════════
step "Setting GitHub Repository Variables"

prompt_val "GHOST_L3_RPC URL" GHOST_L3_RPC "http://localhost:39545"
prompt_val "LITVYB_API_URL (backend API)" LITVYB_API_URL "http://localhost:7001"
prompt_val "LITVYB_SOCKET_URL (WebSocket)" LITVYB_SOCKET_URL "http://localhost:7001"
prompt_val "GHOSTBRAIN_URL (AI service)" GHOSTBRAIN_URL "http://localhost:7002"
prompt_val "MEDIASOUP_URL (SFU signalling)" MEDIASOUP_URL "http://localhost:2000"

set_var "GHOST_L3_RPC"        "$GHOST_L3_RPC"
set_var "LITVYB_API_URL"      "$LITVYB_API_URL"
set_var "LITVYB_SOCKET_URL"   "$LITVYB_SOCKET_URL"
set_var "GHOSTBRAIN_URL"      "$GHOSTBRAIN_URL"
set_var "MEDIASOUP_URL"       "$MEDIASOUP_URL"

if $VARS_ONLY; then
  info "Variables set. Skipping secrets (--vars-only)."
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PART 2 — iOS Signing Secrets
# ═══════════════════════════════════════════════════════════════════════════════
step "iOS Code Signing Secrets"
echo ""
echo "  You need:"
echo "  1. Apple Distribution certificate exported as .p12 from Keychain Access"
echo "     (Keychain Access → My Certificates → right-click → Export)"
echo "  2. Provisioning profile (.mobileprovision) downloaded from"
echo "     developer.apple.com → Certificates, IDs & Profiles → Profiles"
echo "  3. Your 10-character Apple Developer Team ID from"
echo "     developer.apple.com → Account → Membership"
echo ""

prompt_file  "Path to .p12 certificate file" P12_PATH
prompt_val   "Certificate passphrase (p12 password)" P12_PASSWORD ""
prompt_file  "Path to .mobileprovision file" PROV_PROFILE_PATH
prompt_val   "Apple Developer Team ID (10 chars)" APPLE_TEAM_ID ""

# Encode and set
P12_B64="$(base64 -w0 "${P12_PATH}")"
PROV_B64="$(base64 -w0 "${PROV_PROFILE_PATH}")"

set_secret "APPLE_CERTIFICATE_BASE64"            "$P12_B64"
set_secret "APPLE_CERTIFICATE_PASSWORD"          "$P12_PASSWORD"
set_secret "APPLE_PROVISIONING_PROFILE_BASE64"   "$PROV_B64"
set_secret "APPLE_TEAM_ID"                       "$APPLE_TEAM_ID"

# Update ExportOptions.plist with real Team ID
if [[ -n "$APPLE_TEAM_ID" ]] && ! $DRY_RUN; then
  EXPORT_PLIST="${MOBILE_DIR}/ios/ExportOptions.plist"
  if [[ -f "$EXPORT_PLIST" ]]; then
    sed -i "s/\$(APPLE_TEAM_ID)/${APPLE_TEAM_ID}/g" "$EXPORT_PLIST"
    info "  ✓ ExportOptions.plist updated with Team ID: ${APPLE_TEAM_ID}"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PART 3 — Firebase Secrets
# ═══════════════════════════════════════════════════════════════════════════════
step "Firebase Secrets"
echo ""
echo "  Download from Firebase Console:"
echo "  → Project Settings → Your Apps → iOS app → GoogleService-Info.plist"
echo "  → Project Settings → Your Apps → Android app → google-services.json"
echo ""

echo "  iOS GoogleService-Info.plist:"
prompt_file "Path to GoogleService-Info.plist" IOS_GSERVICE_PATH
IOS_GSERVICE_B64="$(base64 -w0 "${IOS_GSERVICE_PATH}")"
set_secret "FIREBASE_IOS_GOOGLE_SERVICES_BASE64" "$IOS_GSERVICE_B64"

# Copy real plist into the iOS project (replaces placeholder)
if ! $DRY_RUN; then
  cp "${IOS_GSERVICE_PATH}" "${MOBILE_DIR}/ios/Runner/GoogleService-Info.plist"
  info "  ✓ GoogleService-Info.plist installed into ios/Runner/"
fi

echo ""
echo "  Android google-services.json (optional — skip with Enter):"
ANDROID_GSERVICE_PATH=""
read -r -p "  Path to google-services.json (or Enter to skip): " ANDROID_GSERVICE_PATH
ANDROID_GSERVICE_PATH="${ANDROID_GSERVICE_PATH/#\~/$HOME}"
if [[ -f "$ANDROID_GSERVICE_PATH" ]]; then
  ANDROID_GSERVICE_B64="$(base64 -w0 "${ANDROID_GSERVICE_PATH}")"
  set_secret "FIREBASE_ANDROID_GOOGLE_SERVICES_BASE64" "$ANDROID_GSERVICE_B64"
  if ! $DRY_RUN; then
    cp "${ANDROID_GSERVICE_PATH}" "${ANDROID_DIR}/app/google-services.json"
    info "  ✓ google-services.json installed into android/app/"
  fi
else
  warn "  Skipping Android Firebase config."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PART 4 — Android Keystore (optional — if not done yet)
# ═══════════════════════════════════════════════════════════════════════════════
step "Android Keystore"
KEYSTORE_FILE="${ANDROID_DIR}/app/litvyblive-release.jks"
if [[ -f "$KEYSTORE_FILE" ]]; then
  info "  Keystore already exists at ${KEYSTORE_FILE}"
  STORE_PASS=""
  KEY_PASS=""
  KEY_ALIAS="litvyblive"
  prompt_val "  Store password" STORE_PASS ""
  prompt_val "  Key password"   KEY_PASS ""
  prompt_val "  Key alias"      KEY_ALIAS "litvyblive"
else
  warn "  No keystore found. Run apps/litvyblive/gen-keystore.sh first, then re-run this script."
  warn "  Or provide an existing .jks file:"
  SKIP_KEYSTORE=false
  read -r -p "  Path to existing .jks (or Enter to skip): " JKS_PATH
  JKS_PATH="${JKS_PATH/#\~/$HOME}"
  if [[ -f "$JKS_PATH" ]]; then
    cp "$JKS_PATH" "$KEYSTORE_FILE"
    prompt_val "  Store password" STORE_PASS ""
    prompt_val "  Key password"   KEY_PASS ""
    prompt_val "  Key alias"      KEY_ALIAS "litvyblive"
  else
    warn "  Skipping Android keystore secrets."
    SKIP_KEYSTORE=true
  fi
fi

if [[ "${SKIP_KEYSTORE:-false}" != "true" ]] && [[ -f "$KEYSTORE_FILE" ]]; then
  KS_B64="$(base64 -w0 "${KEYSTORE_FILE}")"
  set_secret "ANDROID_KEYSTORE_BASE64"  "$KS_B64"
  set_secret "ANDROID_STORE_PASSWORD"   "${STORE_PASS}"
  set_secret "ANDROID_KEY_PASSWORD"     "${KEY_PASS}"
  set_secret "ANDROID_KEY_ALIAS"        "${KEY_ALIAS:-litvyblive}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PART 5 — Commit real Firebase config (if changed) and trigger build
# ═══════════════════════════════════════════════════════════════════════════════
step "Summary"

if ! $DRY_RUN; then
  # Stage any updated files
  cd "${SCRIPT_DIR}/../.."
  CHANGED=$(git diff --name-only \
    "apps/litvyblive/mobile/ios/Runner/GoogleService-Info.plist" \
    "apps/litvyblive/mobile/ios/ExportOptions.plist" \
    "apps/litvyblive/mobile/android/app/google-services.json" 2>/dev/null || true)
  if [[ -n "$CHANGED" ]]; then
    git add \
      "apps/litvyblive/mobile/ios/Runner/GoogleService-Info.plist" \
      "apps/litvyblive/mobile/ios/ExportOptions.plist" \
      "apps/litvyblive/mobile/android/app/google-services.json" 2>/dev/null || true
    git commit -m "chore(mobile): install Firebase config + Apple Team ID for iOS CI" \
      --no-verify 2>/dev/null || warn "  Nothing new to commit."
    git push origin main 2>/dev/null || warn "  Push failed — push manually."
    info "  ✓ Firebase config committed."
  fi
fi

echo ""
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │  All secrets and variables are set.                  │"
echo "  │                                                      │"
echo "  │  Workflow: ${WORKFLOW_FILE}           │"
echo "  │  Jobs: analyze → android + ios → release (on tag)    │"
echo "  └──────────────────────────────────────────────────────┘"
echo ""

if $DO_TRIGGER; then
  step "Triggering iOS build"
  if $DRY_RUN; then
    echo "  [DRY-RUN] gh workflow run ${WORKFLOW_FILE} --repo ${REPO} -f build_type=release"
  else
    gh workflow run "${WORKFLOW_FILE}" \
      --repo "${REPO}" \
      --ref main \
      -f build_type=release
    info "  ✓ Workflow triggered. Monitor at:"
    info "    https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}"
  fi
else
  echo "  To trigger the build now:"
  echo ""
  echo "    gh workflow run ${WORKFLOW_FILE} \\"
  echo "      --repo ${REPO} \\"
  echo "      --ref main \\"
  echo "      -f build_type=release"
  echo ""
  echo "  Or re-run this script with --trigger"
fi
