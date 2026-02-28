# GhostDNS Final-Evolution Audit (Phase 1)

Date: 2026-02-25

## Current DNS Posture

- Host has `systemd-resolved` listening on `127.0.0.53:53` and `127.0.0.54:53`.
- No host `named` service active at audit time.
- Existing GhostDNS stack in `docker-compose.autonomy.yml` is API-based (`ghostdns-indexer`, `ghostdns-resolver`, `ghostdns-ai-policy`, `ghostdns-attestor`) and not authoritative DNS.

## Ports in Use

- Host primary IP: `192.168.122.205`
- Default gateway: `192.168.122.1`
- DNS listener in use: loopback only (resolved), no host-wide :53 listener.
- Proposed GhostDNS microservice ports:
  - `53/udp`, `53/tcp` (DNS)
  - `127.0.0.1:18089/tcp` (control API)

## Proposed Compose Wiring

- Add `ghostdns-ai` container in `ghostdns` profile.
- Mount read-only docker socket for container discovery.
- Attach to internal compose network and publish DNS port for client/container resolver use.
- Keep control API local-bind only.

## Security Risks + Mitigations

1. Open recursion abuse
   - Mitigation: ACL-based recursion CIDRs and metrics-based detector.
2. Unauthorized DNS mutation
   - Mitigation: signed approval headers in prod + nonce replay protection.
3. Broken zone reload outage
   - Mitigation: `named-checkconf`, `named-checkzone`, and rollback to last-known-good snapshots.
4. Over-privileged container runtime
   - Mitigation: `cap_drop: [ALL]`, only `NET_BIND_SERVICE`, `no-new-privileges`, read-only rootfs.
5. Blind control-plane failures
   - Mitigation: event sink to HGOP + local fallback incident log.
