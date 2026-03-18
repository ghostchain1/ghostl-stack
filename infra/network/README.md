# GhostStack Network Infrastructure

Production network layout for the `/24` subnet allocation.

## IP Role Map

| IP | Role | Domains |
|---|---|---|
| `38.247.149.218` | Edge gateway / reverse proxy | `*.ghostchain.cloud`, `*.ghostchain.world` |
| `38.247.149.219` | GhostChain L1 RPC | `rpc.ghostchain.cloud` |
| `38.247.149.220` | GhostL2 RPC | `l2.ghostchain.cloud` |
| `38.247.149.221` | GhostL3 RPC | `l3.ghostchain.cloud` |
| `38.247.149.222` | Explorer + API services | `explorer.ghostchain.world`, `wallet.ghostchain.world`, `api.ghostchain.cloud` |
| `38.247.149.223` | AI / GhostBrain services | `ai.ghostchain.cloud`, `brain.ghostchain.cloud` |
| `38.247.149.224` | Monitoring | `grafana.ghostchain.cloud`, `metrics.ghostchain.cloud`, `status.ghostchain.cloud` |

**Gateway:** `38.247.149.1` — **Netmask:** `255.255.255.0`

---

## Deployment Order

### 1. Apply netplan (bind all 7 IPs to eth0)

```bash
sudo cp netplan/01-ghoststack.yaml /etc/netplan/01-ghoststack.yaml
sudo chmod 600 /etc/netplan/01-ghoststack.yaml
sudo netplan apply
ip addr show dev eth0   # verify 7 addresses listed
```

### 2. Firewall (UFW)

```bash
sudo bash firewall/ufw-setup.sh
```

> RPC ports (18545, 29547, 39545) are only reachable from within the `/24` subnet by default. Public traffic goes through the nginx reverse proxy on port 443. Legacy compatibility listeners such as `29545` must not be treated as the canonical GhostL2 RPC.

### 3. SSL certificates

Point all DNS records to `38.247.149.218` first, then:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo bash ssl/certbot-setup.sh
```

### 4. Nginx

```bash
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo cp nginx/conf.d/*.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Kong Gateway (optional, DB-less)

```bash
docker compose -f kong/docker-compose.yml up -d
```

### 6. Docker services with IP binding

Add the network overlay to your compose command:

```bash
docker compose \
  -f docker-compose.yml \
  -f infra/network/docker-compose.network.yml \
  up -d
```

Or add to `.env`:

```
COMPOSE_FILE=docker-compose.yml:infra/network/docker-compose.network.yml
```

---

## Traffic Flow

```
Internet
   │
   ▼
38.247.149.218:443  (nginx/Kong — SSL termination)
   │
   ├─ rpc.ghostchain.cloud    → 38.247.149.219:18545  (L1 RPC)
   ├─ l2.ghostchain.cloud     → 38.247.149.220:29547  (L2 RPC)
   ├─ l3.ghostchain.cloud     → 38.247.149.221:39545  (L3 RPC)
   ├─ explorer.ghostchain.world → 38.247.149.222:3000 (GhostScan)
   ├─ wallet.ghostchain.world  → 38.247.149.222:3002  (GhostWallet)
   ├─ api.ghostchain.cloud     → 38.247.149.222:3001  (API BFF)
   ├─ brain.ghostchain.cloud   → 38.247.149.223:7900  (GhostBrain) [subnet only]
   ├─ ai.ghostchain.cloud      → 38.247.149.223:4080  (AI Swarm)   [subnet only]
   ├─ grafana.ghostchain.cloud → 38.247.149.224:3000  (Grafana)    [subnet only]
   └─ metrics.ghostchain.cloud → 38.247.149.224:9090  (Prometheus) [subnet only]
```

---

## Security Notes

- Admin/monitoring endpoints (brain, ai, grafana, metrics) are restricted to `38.247.149.0/24` at both nginx and Kong layers.
- RPC ports are not exposed on the public firewall — only accessible through the SSL-terminated reverse proxy.
- All RPC responses block `admin_`, `debug_`, and `personal_` JSON-RPC methods at the nginx layer.
- Kong adds request-ID tracing (`X-Ghost-Request-Id`) on all routes for log correlation.
- SSL is TLS 1.2/1.3 only; auto-renewed via certbot cron.
