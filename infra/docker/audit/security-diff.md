# Security Diff

Changes applied to unified compose files:

- Added `security_opt: ["no-new-privileges:true"]` to every service in:
  - `infra/docker/compose/docker-compose.core.yml`
  - `infra/docker/compose/docker-compose.services.yml`
  - `infra/docker/compose/docker-compose.ui.yml`
  - `infra/docker/compose/docker-compose.obs.yml`
  - `infra/docker/compose/docker-compose.ai.yml`

No changes were applied to the original compose files.
