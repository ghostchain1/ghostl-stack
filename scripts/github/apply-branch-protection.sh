#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-ghostchain1/ghostl-stack}"
BRANCH="${2:-main}"
DRY_RUN="${3:-}"

if [[ "$DRY_RUN" == "--dry-run" || "$DRY_RUN" == "-n" ]]; then
  DRY_RUN=1
else
  DRY_RUN=0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required but not installed." >&2
  exit 1
fi

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  gh label create "$name" \
    --repo "$REPO" \
    --color "$color" \
    --description "$description" \
    --force >/dev/null
}

enable_required_signatures() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] would enable required signed commits for ${REPO}:${BRANCH}"
    return 0
  fi
  gh api \
    --method POST \
    -H "Accept: application/vnd.github+json" \
    "repos/${REPO}/branches/${BRANCH}/protection/required_signatures" >/dev/null
}

required_contexts_json="$(cat <<'JSON'
[
  "rpc-namespace",
  "shellcheck",
  "node-lint-build",
  "contracts-hardhat-compile",
  "contracts-gst-invariant",
  "contracts-lge-tests",
  "contracts-cascading-finality",
  "secure-preflight"
]
JSON
)"

payload="$(jq -nc --argjson contexts "$required_contexts_json" '
{
  "required_status_checks": {
    "strict": true,
    "contexts": $contexts
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
')"

echo "Ensuring required labels on ${REPO}..."
while IFS='|' read -r name color description; do
  ensure_label "$name" "$color" "$description"
done <<'LABELS'
dependencies|0E8A16|Pull requests that update a dependency file
ci|1D76DB|Continuous integration and workflow updates
dependabot|1D76DB|Dependabot managed pull request
automerge:candidate|0E8A16|Safe candidate for automated merge
semver:patch|0E8A16|Semver patch dependency update
semver:minor|FBCA04|Semver minor dependency update
semver:major|B60205|Semver major dependency update
semver:unknown|5319E7|Dependency update with unknown semver classification
ecosystem:github-actions|1D76DB|Dependency update in github-actions ecosystem
ecosystem:npm|1D76DB|Dependency update in npm ecosystem
ecosystem:unknown|1D76DB|Dependency update in an unknown or new ecosystem
LABELS

echo "Applying branch protection to ${REPO}:${BRANCH}..."
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] would call: PUT repos/${REPO}/branches/${BRANCH}/protection"
  echo "[dry-run] payload:"
  echo "$payload" | jq .
else
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/${REPO}/branches/${BRANCH}/protection" \
    --input - <<<"${payload}" >/dev/null
fi

echo "Enabling required signed commits on ${REPO}:${BRANCH}..."
enable_required_signatures

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Preview complete. Required status checks that would be configured:"
else
  echo "Applied. Effective required status checks:"
fi
if [ "$DRY_RUN" -eq 1 ]; then
  echo "$required_contexts_json" | jq -r '.[]'
else
  gh api "repos/${REPO}/branches/${BRANCH}/protection/required_status_checks" --jq '.contexts[]'
fi
