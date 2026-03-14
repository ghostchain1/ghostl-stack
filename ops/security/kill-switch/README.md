# Kill Switch (Docker + Kubernetes)

The kill switch halts non-chain services and records an incident marker. It is designed to avoid chain data loss.

## Manual Activation

```
./ops/security/kill-switch/activate.sh --snapshot ./ops/docker/snapshots/<timestamp> --mode prod --reason "manual"
```

## Release

```
./ops/security/kill-switch/release.sh --mode prod --reason "cleared"
```

## Kubernetes Notes

If `kubectl` is available in the environment, you may implement additional safeguards (label-based rollouts, scale-to-zero for non-chain workloads). The current scripts do not perform Kubernetes mutations by default.

Optional Kubernetes helpers:

```
./ops/security/kill-switch/k8s-freeze.sh --namespace <ns> --scale-selector "com.ghostchain.role!=chain"
./ops/security/kill-switch/k8s-release.sh --namespace <ns>
```

Kubernetes integration via environment variables:

```
export KILL_SWITCH_K8S=true
export K8S_NAMESPACE=default
export K8S_SELECTOR="app=ghostchain"
export K8S_SCALE_SELECTOR="com.ghostchain.role!=chain"
```
