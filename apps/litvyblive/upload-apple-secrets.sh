#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# upload-apple-secrets.sh
#
# Upload iOS signing secrets to GitHub Actions once you have:
#   1. Apple Distribution .p12  (from Keychain Access or fastlane match)
#   2. .mobileprovision          (from developer.apple.com → Profiles)
#   3. Apple Team ID             (10 chars, from developer.apple.com/account)
#   4. Firebase GoogleService-Info.plist  (from Firebase Console)
#
# Usage:
#   chmod +x upload-apple-secrets.sh
#   ./upload-apple-secrets.sh                   # interactive
#   ./upload-apple-secrets.sh --dry-run         # print only
#
# CSR to submit to Apple:
#   mobile/ios/signing/litvyblive.certSigningRequest
#
# After Apple issues the cert:
#   1. Download the .cer from developer.apple.com
#   2. Import it into Keychain Access
#   3. Export the keypair as .p12  (right-click → Export)
#   4. Run this script
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="ghostchain1/ghostl-stack"
DRY_RUN=false
for arg in "$@"; do [[ "$arg" == "--dry-run" ]] && DRY_RUN=true; done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }
step()  { echo -e "\n${CYAN}▶ $*${NC}"; }

set_secret() {
  local name="$1" value="$2"
  if $DRY_RUN; then
    echo "  [DRY-RUN] would set secret: $name"
  else
    printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
    info "Secret set: $name"
  fi
}

prompt_file() {
  local prompt="$1" var="$2"
  local path=""
  while true; do
    read -r -p "  $prompt: " path
    path="${path/#\~/$HOME}"
    [[ -f "$path" ]] && { printf -v "$var" '%s' "$path"; return; }
    warn "File not found: $path — try again"
  done
}

prompt_val() {
  local prompt="$1" var="$2" default="${3:-}"
  local val=""
  read -r -p "  $prompt${default:+ [$default]}: " val
  printf -v "$var" '%s' "${val:-$default}"
}

# ── Preflight ──────────────────────────────────────────────────────────────────
command -v gh >/dev/null 2>&1 || error "gh CLI not found"
gh auth status >/dev/null 2>&1 || error "Not authenticated — run: gh auth login"

echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  LitVybz Live — Apple iOS Signing Secrets Upload        │"
echo "  │                                                         │"
echo "  │  CSR file to submit to Apple:                           │"
echo "  │  apps/litvyblive/mobile/ios/signing/                    │"
echo "  │      litvyblive.certSigningRequest                      │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""

# ── Part 1: Apple Distribution Certificate ────────────────────────────────────
step "Apple Distribution Certificate (.p12)"
echo ""
echo "  How to get this:"
echo "  1. Go to developer.apple.com → Certificates, IDs & Profiles → Certificates"
echo "  2. Click + → iOS Distribution (App Store & Ad Hoc)"
echo "  3. Upload the CSR file: mobile/ios/signing/litvyblive.certSigningRequest"
echo "  4. Download the issued .cer file"
echo "  5. Double-click to import into Keychain Access"
echo "  6. In Keychain Access → My Certificates → right-click → Export as .p12"
echo ""

prompt_file "Path to Distribution .p12 file" P12_PATH
prompt_val  "p12 passphrase" P12_PASS ""

P12_B64="$(base64 -w0 "$P12_PATH")"
set_secret "APPLE_CERTIFICATE_BASE64"   "$P12_B64"
set_secret "APPLE_CERTIFICATE_PASSWORD" "$P12_PASS"

# ── Part 2: Provisioning Profile ──────────────────────────────────────────────
step "Provisioning Profile (.mobileprovision)"
echo ""
echo "  How to get this:"
echo "  1. developer.apple.com → Certificates, IDs & Profiles → Profiles"
echo "  2. Click + → Ad Hoc (for device testing) or App Store (for submission)"
echo "  3. Select App ID: com.ghostchain.litvyblive"
echo "  4. Select your Distribution certificate"
echo "  5. Name it: LitVybz Live AdHoc   (must match ExportOptions.plist)"
echo "  6. Download the .mobileprovision file"
echo ""

prompt_file "Path to .mobileprovision file" PROV_PATH
PROV_B64="$(base64 -w0 "$PROV_PATH")"
set_secret "APPLE_PROVISIONING_PROFILE_BASE64" "$PROV_B64"

# ── Part 3: Team ID ───────────────────────────────────────────────────────────
step "Apple Developer Team ID"
echo ""
echo "  Find it at: developer.apple.com → Account → Membership Details"
echo "  Format: 10 alphanumeric characters, e.g. AB12CD34EF"
echo ""

prompt_val "Team ID (10 chars)" TEAM_ID ""
[[ -z "$TEAM_ID" ]] && error "Team ID cannot be empty"
set_secret "APPLE_TEAM_ID" "$TEAM_ID"

# Update ExportOptions.plist with real Team ID
EXPORT_PLIST="$(dirname "$0")/mobile/ios/ExportOptions.plist"
if [[ -f "$EXPORT_PLIST" ]] && ! $DRY_RUN; then
  sed -i "s/\$(APPLE_TEAM_ID)/${TEAM_ID}/g" "$EXPORT_PLIST"
  info "ExportOptions.plist updated with Team ID: $TEAM_ID"
fi

# ── Part 4: Firebase GoogleService-Info.plist ─────────────────────────────────
step "Firebase GoogleService-Info.plist (iOS)"
echo ""
echo "  How to get this:"
echo "  1. Firebase Console → Project Settings → Your Apps"
echo "  2. Select iOS app (bundle ID: com.ghostchain.litvyblive)"
echo "     If no iOS app yet: click Add app → iOS → use bundle ID above"
echo "  3. Download GoogleService-Info.plist"
echo ""

prompt_file "Path to GoogleService-Info.plist" GSERVICE_PATH
GSERVICE_B64="$(base64 -w0 "$GSERVICE_PATH")"
set_secret "FIREBASE_IOS_GOOGLE_SERVICES_BASE64" "$GSERVICE_B64"

# Copy into project
if ! $DRY_RUN; then
  cp "$GSERVICE_PATH" "$(dirname "$0")/mobile/ios/Runner/GoogleService-Info.plist"
  info "GoogleService-Info.plist installed into mobile/ios/Runner/"
fi

# ── Commit + trigger ──────────────────────────────────────────────────────────
step "Finalising"

if ! $DRY_RUN; then
  REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  cd "$REPO_ROOT"

  CHANGED=$(git diff --name-only \
    apps/litvyblive/mobile/ios/Runner/GoogleService-Info.plist \
    apps/litvyblive/mobile/ios/ExportOptions.plist 2>/dev/null || true)

  if [[ -n "$CHANGED" ]]; then
    git add "$CHANGED"
    git commit -m "chore(mobile): inject real Firebase + ExportOptions Team ID [ci skip]"
    git push origin main
    info "Committed and pushed updated iOS config files"
  fi

  echo ""
  echo "  All secrets set. Triggering signed iOS build..."
  gh workflow run litvyblive-mobile.yml \
    --repo "$REPO" \
    --ref main \
    -f build_type=release
  echo ""
  gh run list --repo "$REPO" --workflow=litvyblive-mobile.yml --limit 3
fi

echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │  Done! Signed IPA will be in the workflow artifacts.    │"
echo "  │  To submit to TestFlight: download the .ipa and use     │"
echo "  │  Transporter (macOS) or xcrun altool.                   │"
echo "  └─────────────────────────────────────────────────────────┘"
