# Observability System

This folder contains the infra, AI logic, and documentation for the unified logging pipeline used by the GhostChain stack.

Contents:
- collector/: Vector log shipper configuration.
- normalizer/: Log normalization and redaction notes.
- ai/: AI helpers for anomaly detection, root-cause analysis, and incident summaries.
- storage/: Loki configuration.
- alerts/: Prometheus alert rules for log-derived metrics.
- infra/: Docker Compose, systemd, and Kubernetes manifests.
- docs/: Architecture and deployment guides.

UI:
- /observability/logs in apps/web provides the interactive console.
- /observability/logs/api in apps/api serves query, stream, aggregate, incidents, insights, and metrics endpoints.
 - observability/infra/docker-compose.yml is a standalone observability stack.
