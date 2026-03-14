# GhostNetSync Plan 20260227T200033Z

- Routing law valid: `True`
- External public IP allocations valid: `True`
- Subnet overlaps: `0`

## Actions
- [3] p3-hyper-1 :: Ensure bridge br-mgmt
- [3] p3-hyper-2 :: Ensure bridge br-l1
- [3] p3-hyper-3 :: Ensure bridge br-l2
- [3] p3-hyper-4 :: Ensure bridge br-l3
- [4] p4-vm-5 :: Validate network config for VM ghost-l1-node (l1)
- [4] p4-vm-6 :: Configure interface ens3 on VM ghost-l1-node for l1
- [4] p4-vm-7 :: Configure interface ens4 on VM ghost-l1-node for external
- [4] p4-vm-8 :: Validate network config for VM ghost-l2-node (l2)
- [4] p4-vm-9 :: Configure interface ens3 on VM ghost-l2-node for l2
- [4] p4-vm-10 :: Configure interface ens4 on VM ghost-l2-node for external
- [4] p4-vm-11 :: Validate network config for VM ghost-l3-node (l3)
- [4] p4-vm-12 :: Configure interface ens3 on VM ghost-l3-node for l3
- [4] p4-vm-13 :: Configure interface ens4 on VM ghost-l3-node for external
- [4] p4-vm-14 :: Validate network config for VM ghost-observability-node (observability)
- [4] p4-vm-15 :: Configure interface ens3 on VM ghost-observability-node for mgmt
- [4] p4-vm-16 :: Configure interface ens4 on VM ghost-observability-node for external
- [4] p4-vm-17 :: Validate network config for VM ghost-edge-failover-1 (edge-failover)
- [4] p4-vm-18 :: Configure interface ens3 on VM ghost-edge-failover-1 for mgmt
- [4] p4-vm-19 :: Configure interface ens4 on VM ghost-edge-failover-1 for external
- [4] p4-vm-20 :: Validate network config for VM ghost-edge-failover-2 (edge-failover)
- [4] p4-vm-21 :: Configure interface ens3 on VM ghost-edge-failover-2 for mgmt
- [4] p4-vm-22 :: Configure interface ens4 on VM ghost-edge-failover-2 for external
- [4] p4-vm-23 :: Validate network config for VM ghost-edge-failover-3 (edge-failover)
- [4] p4-vm-24 :: Configure interface ens3 on VM ghost-edge-failover-3 for mgmt
- [4] p4-vm-25 :: Configure interface ens4 on VM ghost-edge-failover-3 for external
- [5] p5-docker-26 :: Ensure docker network ghost-devnet
