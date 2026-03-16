# GhostChain Web Mesh

## Local ports

- `4000` `ghostl-api`
- `3200` `ghostl-web`
- `4200` `ghostx`
- `3027` `control-center`
- `3010` `web-main`
- `3011` `web-investor`
- `3012` `web-dev`
- `3013` `web-apps`
- `3014` `web-explorer`
- `3015` `web-governance`
- `3016` `web-nodes`
- `3017` `web-exchange`
- `3018` `web-company`
- `3019` `web-status`
- `3020` `web-portal`
- `3021` `web-wallet`
- `3022` `web-bridge`
- `3023` `web-docs`
- `3024` `web-live`
- `3025` `web-ai`
- `3026` `web-rpc-portal`

## Start

```bash
docker compose -f docker-compose.web-full.yml up -d --build
```

## What this bundle covers

- Public GhostChain sites
- The branded operator console
- GhostStack C3
- GhostWallet, Bridge, Docs, Live, AI, and RPC utility sites
- The GhostXchange UI

## Notes

- The microsites now expose the internal routes referenced by their own branded navigation and CTA links.
- The bundle is optimized for localhost port-based access, not production DNS-based routing.
