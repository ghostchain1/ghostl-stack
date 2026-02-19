#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-ghostchain1/ghostl-stack}"
BRANCH="${2:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required but not installed." >&2
  exit 1
fi

payload="$(cat <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "rpc-namespace",
      "shellcheck",
      "ghost-bots-python",
      "node-lint-build",
      "hyper-ghost-supervisor",
      "contracts-hardhat-compile",
      "contracts-gst-invariant",
      "contracts-lge-tests",
      "repo-security",
      "ghost-helper",
      "docker-dry-run"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON
)"

echo "Applying branch protection to ${REPO}:${BRANCH}..."
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<<"${payload}" >/dev/null

echo "Applied. Effective required status checks:"
gh api "repos/${REPO}/branches/${BRANCH}/protection/required_status_checks" --jq '.contexts[]'
