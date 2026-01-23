# Architecture

```mermaid
flowchart LR
  subgraph Sources
    L1[L1 Validators] --> Vector
    L2[L2 Proposers/Batchers] --> Vector
    L3[L3 Proposers/Batchers] --> Vector
    RPC[RPC Gateways] --> Vector
    AI[AI Services] --> Vector
    Vault[Vault] --> Vector
    Ops[DevOps Services] --> Vector
  end

  Vector[Vector Log Shipper]
  Loki[(Loki Log Store)]
  API[apps/api Observability API]
  UI[apps/web /observability/logs]
  Ledger[(Critical Log Ledger)]
  Prom[(Prometheus)]
  Grafana[Grafana]

  Vector --> Loki
  Loki --> API
  API --> UI
  API --> Ledger
  API --> Prom
  Prom --> Grafana
  Loki --> Grafana
```

Data flow:
1. Vector collects Docker logs and tags them with component, layer, chain, and level.
2. Loki stores raw logs for search and streaming.
3. apps/api normalizes logs, redacts secrets, classifies severity, and exposes advanced APIs.
4. Critical logs are written to an append-only ledger with hash chaining.
5. Prometheus scrapes log-derived metrics from apps/api and feeds Grafana dashboards.
