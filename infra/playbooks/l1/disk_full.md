# L1 Playbook: Disk Full

## Detection signals
- `node_filesystem_avail_bytes` low (if host metrics available)
- Geth logs indicate `no space left on device`
- Block height stops advancing; `ai_monitor_head_lag_seconds` grows

## Immediate mitigation
1. Check disk: `df -h`
2. Prune old logs or unused images:
   - `docker system df`
   - `docker image prune -f`

## Permanent fix
- Increase disk size or move datadir to a larger volume.
- Add log rotation for host logs and Docker.

## Verification
- `bash infra/scripts/doctor-l1.sh`
- `curl -s http://localhost:18545/health`
