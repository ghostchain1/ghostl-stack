# GST-Native Migration Baseline (Phase 0)

Captured at: `2026-02-06T05:36:18Z`
Repo root: `/home/ghost/ghostl-stack`
Baseline commit: `ca2f48334c771a08c3841f205e2ea69c0a823e83`
Branch: `brand/gst-native`
Working tree dirty files: `0`

## Host / OS

`Linux bootstrap-arm.us-central1-a.c.ghoststack-486011.internal 6.14.0-1021-gcp #22~24.04.1-Ubuntu SMP Sat Nov 22 06:07:57 UTC 2025 aarch64 aarch64 aarch64 GNU/Linux`

`/etc/os-release`:

```text
PRETTY_NAME="Ubuntu 24.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.3 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=noble
LOGO=ubuntu-logo
```

## Tool Versions

- node: `v22.22.0`
- npm: `10.9.4`
- pnpm: `(not installed)`

- forge:
  ```text
  forge Version: 1.5.1-stable
  Commit SHA: b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2
  Build Timestamp: 2025-12-22T11:39:10.237931527Z (1766403550)
  Build Profile: maxperf
  ```
- cast:
  ```text
  cast Version: 1.5.1-stable
  Commit SHA: b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2
  Build Timestamp: 2025-12-22T11:39:10.237931527Z (1766403550)
  Build Profile: maxperf
  ```

- docker: (may be blocked in harness)
```text
Client: Docker Engine - Community
 Version:           29.2.0
 API version:       1.53
 Go version:        go1.25.6
 Git commit:        0b9d198
 Built:             Mon Jan 26 19:26:09 2026
 OS/Arch:           linux/arm64
 Context:           default
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

- docker compose: (may be blocked in harness)
```text
Docker Compose version v5.0.2
```

## Active Containers (if available)

```text
permission denied while trying to connect to the docker API at unix:///var/run/docker.sock
```

## Listening Ports (best-effort)

```text
State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
LISTEN 0      0         127.0.0.53:53         0.0.0.0:*
LISTEN 0      0            0.0.0.0:7780       0.0.0.0:*
LISTEN 0      0            0.0.0.0:7302       0.0.0.0:*
LISTEN 0      0            0.0.0.0:7303       0.0.0.0:*
LISTEN 0      0            0.0.0.0:7300       0.0.0.0:*
LISTEN 0      0            0.0.0.0:7301       0.0.0.0:*
LISTEN 0      0            0.0.0.0:7576       0.0.0.0:*
LISTEN 0      0            0.0.0.0:7577       0.0.0.0:*
LISTEN 0      0            0.0.0.0:39606      0.0.0.0:*
LISTEN 0      0            0.0.0.0:39551      0.0.0.0:*
LISTEN 0      0            0.0.0.0:39548      0.0.0.0:*
LISTEN 0      0            0.0.0.0:39546      0.0.0.0:*
LISTEN 0      0            0.0.0.0:39545      0.0.0.0:*
LISTEN 0      0            0.0.0.0:17635      0.0.0.0:*
LISTEN 0      0            0.0.0.0:17633      0.0.0.0:*
LISTEN 0      0            0.0.0.0:17766      0.0.0.0:*
LISTEN 0      0            0.0.0.0:17780      0.0.0.0:*
LISTEN 0      0          127.0.0.1:44835      0.0.0.0:*
LISTEN 0      0            0.0.0.0:22         0.0.0.0:*
LISTEN 0      0            0.0.0.0:20202      0.0.0.0:*
LISTEN 0      0            0.0.0.0:3100       0.0.0.0:*
LISTEN 0      0            0.0.0.0:3000       0.0.0.0:*
LISTEN 0      0            0.0.0.0:18660      0.0.0.0:*
LISTEN 0      0            0.0.0.0:18552      0.0.0.0:*
LISTEN 0      0            0.0.0.0:18551      0.0.0.0:*
LISTEN 0      0            0.0.0.0:18546      0.0.0.0:*
LISTEN 0      0            0.0.0.0:18547      0.0.0.0:*
LISTEN 0      0            0.0.0.0:18545      0.0.0.0:*
LISTEN 0      0            0.0.0.0:29606      0.0.0.0:*
LISTEN 0      0            0.0.0.0:29548      0.0.0.0:*
LISTEN 0      0            0.0.0.0:29547      0.0.0.0:*
LISTEN 0      0            0.0.0.0:29545      0.0.0.0:*
LISTEN 0      0            0.0.0.0:9646       0.0.0.0:*
LISTEN 0      0            0.0.0.0:9546       0.0.0.0:*
LISTEN 0      0          127.0.0.1:36313      0.0.0.0:*
LISTEN 0      0            0.0.0.0:9093       0.0.0.0:*
LISTEN 0      0            0.0.0.0:9090       0.0.0.0:*
LISTEN 0      0         127.0.0.54:53         0.0.0.0:*
LISTEN 0      0            0.0.0.0:8200       0.0.0.0:*
LISTEN 0      0            0.0.0.0:8300       0.0.0.0:*
LISTEN 0      0            0.0.0.0:8301       0.0.0.0:*
LISTEN 0      0            0.0.0.0:8551       0.0.0.0:*
LISTEN 0      0            0.0.0.0:8560       0.0.0.0:*
LISTEN 0      0            0.0.0.0:28546      0.0.0.0:*
LISTEN 0      0            0.0.0.0:28547      0.0.0.0:*
LISTEN 0      0            0.0.0.0:28088      0.0.0.0:*
LISTEN 0      0                  *:2375             *:*
```

## Notes

- This is a **baseline snapshot** for the GST-native rebrand effort.
- Docker daemon access may be unavailable in this harness; if so, container state is recorded as an error string above.
