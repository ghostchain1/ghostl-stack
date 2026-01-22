# Deployment

Docker Compose
- Use infra/opstack/docker-compose.yml for the full stack.
- Vector ships container logs to Loki and Grafana exposes logs + metrics dashboards.

Systemd
- Use observability/infra/systemd/observability-stack.service to launch the Compose stack.

Kubernetes
- Manifests in observability/infra/k8s provide Loki, Grafana, and Vector.
- Configure persistent volumes for Loki and Grafana, and mount vector.yaml via ConfigMap.

Environment variables (apps/api)
- OBSERVABILITY_CRITICAL_LOG_PATH: path to the critical log ledger file
- OBSERVABILITY_CRITICAL_LOG_SECRET: optional HMAC secret for ledger entries
- OBSERVABILITY_LOG_MAX_LIMIT: max log events returned per query

Cold storage
- observability/storage/loki-s3-config.yml enables S3-backed retention for long-term archives.
