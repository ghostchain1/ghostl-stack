#!/usr/bin/env bash
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  LitVybz Live — Local Build Script                                      │
# │  Installs Flutter + Android SDK, then builds APK/AAB.                   │
# │                                                                          │
# │  Usage:                                                                  │
# │    chmod +x build-mobile.sh                                              │
# │    ./build-mobile.sh            # Android debug APK                      │
# │    ./build-mobile.sh --release  # Android release APK + AAB              │
# │    ./build-mobile.sh --ios      # iOS (macOS only, no-codesign)          │
# │                                                                          │
# │  CI/CD: see .github/workflows/litvyblive-mobile.yml                     │
# └─────────────────────────────────────────────────────────────────────────┘
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MOBILE_DIR="${REPO_ROOT}/apps/litvyblive/mobile"
SDK_DIR="${REPO_ROOT}/packages/ghost_flutter_sdk"

FLUTTER_VERSION="3.27.4"
FLUTTER_HOME="${HOME}/.flutter-sdk"
ANDROID_HOME="${ANDROID_HOME:-${HOME}/Android/Sdk}"
JAVA_VERSION="17"

BUILD_MODE="debug"
BUILD_IOS=false
BUILD_DOCKER=false

# ── Arg parsing ──────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --release) BUILD_MODE="release" ;;
    --profile) BUILD_MODE="profile" ;;
    --ios)     BUILD_IOS=true ;;
    --docker)  BUILD_DOCKER=true ;;
    --help|-h)
      sed -n '/^# ┌/,/^# └/p' "$0"
      exit 0
      ;;
  esac
done

# ── Colour helpers ───────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[litvyblive-build]${NC} $*"; }
warn()  { echo -e "${YELLOW}[litvyblive-build]${NC} $*"; }
error() { echo -e "${RED}[litvyblive-build]${NC} $*" >&2; exit 1; }

# ── Docker shortcut ──────────────────────────────────────────────────────
if $BUILD_DOCKER; then
  info "Building via Docker (requires network for image pull)..."
  docker build \
    -f "${REPO_ROOT}/apps/litvyblive/Dockerfile.android" \
    -t litvyblive-android-builder \
    "${REPO_ROOT}"
  docker run --rm \
    -v "${MOBILE_DIR}/build:/workspace/apps/litvyblive/mobile/build" \
    litvyblive-android-builder
  info "APKs written to ${MOBILE_DIR}/build/app/outputs/flutter-apk/"
  exit 0
fi

# ── iOS check ────────────────────────────────────────────────────────────
if $BUILD_IOS && [[ "$(uname)" != "Darwin" ]]; then
  error "iOS builds require macOS. Use a Mac or the GitHub Actions workflow."
fi

# ── Install Flutter if not present ───────────────────────────────────────
install_flutter() {
  if command -v flutter &>/dev/null; then
    local ver
    ver=$(flutter --version 2>&1 | grep -oP 'Flutter \K[0-9.]+' | head -1)
    info "Flutter ${ver} already installed at $(which flutter)"
    return
  fi

  info "Installing Flutter ${FLUTTER_VERSION} to ${FLUTTER_HOME}..."
  local os_suffix
  if [[ "$(uname)" == "Darwin" ]]; then
    os_suffix="macos-x64"
    local ext="zip"
  else
    os_suffix="linux-x64"
    local ext="tar.xz"
  fi

  local url="https://storage.googleapis.com/flutter_infra_release/releases/stable/${os_suffix}/flutter_${os_suffix}_${FLUTTER_VERSION}-stable.${ext}"
  mkdir -p "$(dirname "${FLUTTER_HOME}")"

  if [[ "${ext}" == "zip" ]]; then
    curl -fL "${url}" -o /tmp/flutter.zip
    unzip -q /tmp/flutter.zip -d "$(dirname "${FLUTTER_HOME}")"
    mv "$(dirname "${FLUTTER_HOME}")/flutter" "${FLUTTER_HOME}"
    rm /tmp/flutter.zip
  else
    curl -fL "${url}" | tar xJ -C "$(dirname "${FLUTTER_HOME}")"
    mv "$(dirname "${FLUTTER_HOME}")/flutter" "${FLUTTER_HOME}"
  fi

  export PATH="${FLUTTER_HOME}/bin:${PATH}"
  flutter precache --android 2>/dev/null || true
  info "Flutter installed."
}

# ── Install Android SDK if not present ───────────────────────────────────
install_android_sdk() {
  if [[ -d "${ANDROID_HOME}/platform-tools" ]]; then
    info "Android SDK found at ${ANDROID_HOME}"
    return
  fi

  if ! command -v java &>/dev/null; then
    warn "Java not found. Installing OpenJDK ${JAVA_VERSION} via apt..."
    sudo apt-get install -y "openjdk-${JAVA_VERSION}-jdk" 2>/dev/null || \
      error "Please install Java ${JAVA_VERSION} manually: https://adoptium.net/"
  fi

  info "Installing Android command-line tools to ${ANDROID_HOME}..."
  local cmdtools_url="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  mkdir -p "${ANDROID_HOME}/cmdline-tools"
  curl -fL "${cmdtools_url}" -o /tmp/cmdline-tools.zip
  unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-extracted
  mv /tmp/cmdline-extracted/cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest"
  rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-extracted

  export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  info "Android SDK installed."
}

# ── Main ─────────────────────────────────────────────────────────────────
main() {
  install_flutter
  export PATH="${FLUTTER_HOME}/bin:${PATH}"

  if ! $BUILD_IOS; then
    install_android_sdk
    export ANDROID_HOME ANDROID_SDK_ROOT="${ANDROID_HOME}"
    export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"
  fi

  info "Installing ghost_flutter_sdk dependencies..."
  (cd "${SDK_DIR}" && flutter pub get)

  info "Installing app dependencies..."
  (cd "${MOBILE_DIR}" && flutter pub get)

  info "Running flutter analyze..."
  (cd "${MOBILE_DIR}" && flutter analyze --no-fatal-infos) || warn "Analyze found warnings (continuing)"

  if $BUILD_IOS; then
    info "Building iOS (${BUILD_MODE}, no-codesign)..."
    (cd "${MOBILE_DIR}" && flutter build ios --"${BUILD_MODE}" --no-codesign)
    info "iOS build complete: ${MOBILE_DIR}/build/ios/iphoneos/Runner.app"
    return
  fi

  if [[ "${BUILD_MODE}" == "debug" ]]; then
    info "Building Android debug APK..."
    (cd "${MOBILE_DIR}" && flutter build apk --debug --target-platform android-arm64)
    info "APK: ${MOBILE_DIR}/build/app/outputs/flutter-apk/app-debug.apk"
  else
    info "Building Android release APKs (arm, arm64, x64)..."
    (cd "${MOBILE_DIR}" && flutter build apk --release \
      --target-platform android-arm,android-arm64,android-x64 \
      --split-per-abi)

    info "Building Android App Bundle..."
    (cd "${MOBILE_DIR}" && flutter build appbundle --release)

    info ""
    info "=== Android Build Complete ==="
    ls -lh "${MOBILE_DIR}/build/app/outputs/flutter-apk/"
    ls -lh "${MOBILE_DIR}/build/app/outputs/bundle/release/"

    info ""
    info "Install on device:"
    info "  adb install build/app/outputs/flutter-apk/app-arm64-v8a-release.apk"
    info ""
    info "Upload to Play Store:"
    info "  build/app/outputs/bundle/release/app-release.aab"
  fi
}

main
