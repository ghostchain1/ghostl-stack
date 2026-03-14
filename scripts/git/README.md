# Git helpers

- `git-safe`: wrapper that removes stale `.git/index.lock` when no git process is running for the repo.

Usage:

```bash
./scripts/git/git-safe status
./scripts/git/git-safe add -u -- .
```

Optional alias:

```bash
git config alias.safe "!./scripts/git/git-safe"
```
