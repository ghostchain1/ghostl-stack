# Kubernetes Migration Annotations

The unified compose files add labels on each service to map to Kubernetes metadata.
These labels are **annotations only** and are not applied to any cluster.

## Labels

- `com.ghost.k8s.name`: Kubernetes resource base name.
- `com.ghost.k8s.role`: chain | api | ui | obs | ai
- `com.ghost.k8s.stateful`: true/false (PVC required)
- `com.ghost.k8s.no_recreate`: true/false (no rolling restarts)
- `com.ghost.k8s.volume.claim`: comma-separated volume names
- `com.ghost.k8s.service.type`: ClusterIP | NodePort | LoadBalancer

## Notes

- Chain services are marked `stateful=true` and `no_recreate=true`.
- UI services are marked `LoadBalancer` by default.
- RPC and observability services are marked `NodePort` when ports are exposed.
