#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

echo "deploy_l2oo.sh is retired." >&2
echo "GhostChain no longer uses the legacy output-oracle deployment path." >&2
echo "Use the Ghost finality deployment flow instead:" >&2
echo "  npm --prefix \"$ROOT_DIR/contracts\" run deploy:cascading-finality" >&2
echo "or run the current Ghost settlement/finality scripts under contracts/scripts." >&2
exit 1
