# Docker Risk Report

Items kept for safety:

- All running services (runtime-critical).
- All services with chain data or bound ports.
- Observability stack (Prometheus/Grafana/Loki) kept even if optional.

Notes:

- Services defined in compose but not running were retained because usage could not be proven absent.
