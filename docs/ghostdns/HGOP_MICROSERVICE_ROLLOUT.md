# GhostDNS AI Microservice + HGOP Integration

## Request flow

```mermaid
flowchart LR
  Client[Client/Container/VM] --> DNS[ghostdns-ai :53]
  DNS -->|authoritative| Zone[ghostchain.cloud zone]
  DNS -->|recursive forward| Upstream[1.1.1.1 / 8.8.8.8]
  HGOP[hyper-ghost-supervisor] -->|POST /ghostdns/reconcile| DNS
  DNS -->|event sink| HGOP
  HGOP --> DB[(SQLite ghostdns tables)]
```

## Governance approval flow

```mermaid
sequenceDiagram
  participant Op as Operator
  participant HG as HGOP
  participant DNS as GhostDNS API
  Op->>HG: request mutation
  HG->>HG: create intent hash + signed headers
  HG->>DNS: POST /records/upsert + X-GST-* headers
  DNS->>DNS: verify nonce/timestamp/HMAC (prod)
  DNS->>DNS: validate zone + reload
  DNS->>HG: POST /ghostdns/events
  HG->>DB: insert ghostdns_changes + ghostdns_events
```

## Incident flow

```mermaid
flowchart TD
  Det[HGOP detectors] -->|health/zone check| Inc[ghostdns_incidents]
  Inc --> UI[HyperGhost GhostDNS panel]
  UI --> Pb[Playbook: reconcile/reload/rollback]
  Pb --> API[HGOP /ghostdns/* routes]
  API --> DNS[ghostdns-ai control API]
```

## Safe rollout checklist

1. Build and start GhostDNS microservice profile:
   - `docker compose --env-file services/stack.env -f docker-compose.autonomy.yml --profile ghostdns up -d ghostdns-ai`
2. Validate control plane:
   - `curl -fsS http://127.0.0.1:18089/health`
3. Validate DNS service:
   - `dig +short l1.ghostchain.cloud @127.0.0.1`
4. Wire HGOP env:
   - `HG_GHOSTDNS_URL=http://host.docker.internal:18089`
   - `HG_GHOSTDNS_SHARED_SECRET=<shared-secret>`
5. Use dashboard:
   - `/ai/hyperghost/ghostdns`

## Client DNS setup

- Client primary DNS: hypervisor IP (`192.168.122.205`)
- Client secondary DNS: `1.1.1.1`

## Mode switching

- Dev mode: `POST /set-mode {"mode":"dev"}`
- Test mode: `POST /set-mode {"mode":"test"}`
- Prod mode: `POST /set-mode {"mode":"prod"}` (mutations require signed approval headers)
