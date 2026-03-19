# OP Stack Removal Manifest

This repository now treats the Ghost-native runtime as canonical.

## Removed from the canonical path

- `infra/opstack/` runtime tree
- Root `package.json` OP-specific sync and preflight scripts
- `.gitmodules` entries for OP-specific submodules
- README and app surfaces that presented GhostL2 and GhostL3 as OP Stack rollups

## Canonical replacements

- `chains/ghostl2/chain.json`
- `chains/ghostl3/chain.json`
- `services/ghost-exec/docker-compose.yml`
- `services/ghost-sequencer/docker-compose.yml`
- `services/ghost-deriver/docker-compose.yml`
- `services/ghost-settlement/docker-compose.yml`
- `services/ghost-bridge/docker-compose.yml`
- `services/ghost-proof/docker-compose.yml`
- `docs/architecture/custom-ghost-multichain.md`

## Follow-up debt

- Historical evidence packs and backups still reference legacy OP runtime assets
- Compatibility contracts and non-canonical scripts still need targeted removal or rename
- Launch gates must continue to use Ghost-native services and chain descriptors only
