# ghostl-stack (Codespaces)

Brings up:
- L1: Anvil (31337) on :8545
- GhostL2: Polygon Edge (7192) on :9545
- GhostL3: Polygon Edge (7393) on :10545
- Ghost Guard API on :7070

## Start
```bash
bash infra/scripts/up.sh
```

## Dev prerequisites

- `docker` + Docker Compose
- Node.js + npm
- `git-lfs` (repo has an LFS `pre-push` hook)

## Reset

```bash
bash infra/scripts/reset.sh
```

## Notes

* Contracts deploy to GhostL2.
* services/ghost-guard reads bridge events and can pause via GuardPolicy (requires PRIVATE_KEY).
