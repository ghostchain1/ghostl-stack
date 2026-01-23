# Compose Annotations (Kubernetes Migration Safe)

Add these labels to Docker Compose services to preserve migration metadata. These labels are non-breaking and should not change ports, names, or mounts.

Required for chain data services:

- `com.ghostchain.data.type=chain`
- `com.ghostchain.data.layer=L1|L2|L3`
- `com.ghostchain.data.immutable=true`
- `com.ghostchain.recreate.allowed=false`

Migration labels (all services):

- `workload=deployment|statefulset`
- `persistent=true|false`
- `ports=<comma-separated>`
- `depends_on=<comma-separated>`
- `migration.safe=true`

Kubernetes mapping hints:

- `workload=statefulset` -> StatefulSet + PVC
- `workload=deployment` -> Deployment
- `persistent=true` -> PVC or hostPath mount
- `ports` -> Service ports

No service names, ports, or mount paths should change as part of labeling.
