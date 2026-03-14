#!/usr/bin/env bash
set -euo pipefail

# Build multi-arch images for services that use local Dockerfiles.
# This script is PLAN-ONLY by default and will print the build commands.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cat <<'NOTE'
This script prints buildx commands without executing them.
To run a build, copy the command and execute it manually.
NOTE

# Example usage:
# docker buildx build --platform linux/amd64,linux/arm64 -t yourrepo/ghostl-api:tag -f services/ghostl-api/Dockerfile services/ghostl-api --push

