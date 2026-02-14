# GST-Native Migration Baseline (Phase 0)

Captured at: `2026-02-14T12:31:08Z`
Repo root: `/home/ghost/ghostl-stack`
Baseline commit: `4a264824e4103220f88e75f0242666815180b35b`
Branch: `brand/gst-native`
Working tree dirty files: `1`

## Host / OS

`Linux ghostchain-devnet 6.8.0-94-generic #96-Ubuntu SMP PREEMPT_DYNAMIC Fri Jan  9 20:36:55 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux`

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
  Build Timestamp: 2025-12-22T11:39:01.425730780Z (1766403541)
  Build Profile: maxperf
  ```
- cast:
  ```text
  cast Version: 1.5.1-stable
  Commit SHA: b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2
  Build Timestamp: 2025-12-22T11:39:01.425730780Z (1766403541)
  Build Profile: maxperf
  ```

- docker:
```text
Docker version 28.2.2, build 28.2.2-0ubuntu1~24.04.1
```

- docker compose:
```text
Docker Compose version 2.37.1+ds1-0ubuntu2~24.04.1
```

## Active Containers (if available)

```text
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.50/containers/json": dial unix /var/run/docker.sock: connect: permission denied
```

## Listening Ports (best-effort)

```text
State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
LISTEN 0      4096       127.0.0.1:35517      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:29606      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:29545      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:29547      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:29548      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:5433       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:5434       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7070       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:39606      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:39545      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:39546      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:39548      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:39551      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:6381       0.0.0.0:*
LISTEN 0      1024       127.0.0.1:42567      0.0.0.0:*    users:(("code-591199df40",pid=5586,fd=9))
LISTEN 0      4096         0.0.0.0:7766       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7691       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7690       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7692       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7710       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7617       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7616       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7619       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7618       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7621       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7620       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7623       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7622       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7625       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7624       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7627       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7626       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7629       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7628       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7631       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7630       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7633       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7632       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7635       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7634       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7637       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7636       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7639       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7638       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7641       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7640       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7643       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7642       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7645       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7644       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7601       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7600       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7603       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7602       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7605       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7604       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7607       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7606       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7609       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7608       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7611       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7610       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7613       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7612       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7615       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7614       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7301       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7303       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7302       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7273       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7272       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7283       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7282       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:7171       0.0.0.0:*
LISTEN 0      511        127.0.0.1:39787      0.0.0.0:*    users:(("node",pid=5322,fd=60))
LISTEN 0      4096         0.0.0.0:8546       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:8551       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:8560       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:8301       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:8300       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:8200       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:22         0.0.0.0:*
LISTEN 0      4096         0.0.0.0:18088      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:9646       0.0.0.0:*
LISTEN 0      511        127.0.0.1:37607      0.0.0.0:*    users:(("node",pid=4575,fd=21))
LISTEN 0      4096         0.0.0.0:18660      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:18545      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:18547      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:18546      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:18551      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:18552      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:28547      0.0.0.0:*
LISTEN 0      4096         0.0.0.0:28546      0.0.0.0:*
LISTEN 0      4096      127.0.0.54:53         0.0.0.0:*
LISTEN 0      4096         0.0.0.0:3210       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:3220       0.0.0.0:*
LISTEN 0      4096   127.0.0.53%lo:53         0.0.0.0:*
LISTEN 0      4096            [::]:29606         [::]:*
LISTEN 0      4096            [::]:29545         [::]:*
LISTEN 0      4096            [::]:29547         [::]:*
LISTEN 0      4096            [::]:29548         [::]:*
LISTEN 0      4096            [::]:5433          [::]:*
LISTEN 0      4096            [::]:5434          [::]:*
LISTEN 0      4096            [::]:7070          [::]:*
LISTEN 0      4096            [::]:39606         [::]:*
LISTEN 0      4096            [::]:39545         [::]:*
LISTEN 0      4096            [::]:39546         [::]:*
LISTEN 0      4096            [::]:39548         [::]:*
LISTEN 0      4096            [::]:39551         [::]:*
LISTEN 0      4096            [::]:6381          [::]:*
LISTEN 0      4096            [::]:7766          [::]:*
LISTEN 0      4096            [::]:7691          [::]:*
LISTEN 0      4096            [::]:7690          [::]:*
LISTEN 0      4096            [::]:7692          [::]:*
LISTEN 0      4096            [::]:7710          [::]:*
LISTEN 0      4096            [::]:7617          [::]:*
LISTEN 0      4096            [::]:7616          [::]:*
LISTEN 0      4096            [::]:7619          [::]:*
LISTEN 0      4096            [::]:7618          [::]:*
```

## Notes

- This is a **baseline snapshot** for the GST-native rebrand effort.
- Docker daemon access may be unavailable due to missing `docker.sock` permissions; if so, container state is recorded as an error string above.
