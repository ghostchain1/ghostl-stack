# Rollback

## p3-hyper-1
```bash
bash -lc ip link del br-mgmt || true
```

## p3-hyper-2
```bash
bash -lc ip link del br-l1 || true
```

## p3-hyper-3
```bash
bash -lc ip link del br-l2 || true
```

## p3-hyper-4
```bash
bash -lc ip link del br-l3 || true
```

## p4-vm-5
```bash
bash -lc echo no-op
```

## p4-vm-6
```bash
bash -lc echo rollback-netplan vm=ghost-l1-node if=ens3
```

## p4-vm-7
```bash
bash -lc echo rollback-netplan vm=ghost-l1-node if=ens4
```

## p4-vm-8
```bash
bash -lc echo no-op
```

## p4-vm-9
```bash
bash -lc echo rollback-netplan vm=ghost-l2-node if=ens3
```

## p4-vm-10
```bash
bash -lc echo rollback-netplan vm=ghost-l2-node if=ens4
```

## p4-vm-11
```bash
bash -lc echo no-op
```

## p4-vm-12
```bash
bash -lc echo rollback-netplan vm=ghost-l3-node if=ens3
```

## p4-vm-13
```bash
bash -lc echo rollback-netplan vm=ghost-l3-node if=ens4
```

## p4-vm-14
```bash
bash -lc echo no-op
```

## p4-vm-15
```bash
bash -lc echo rollback-netplan vm=ghost-observability-node if=ens3
```

## p4-vm-16
```bash
bash -lc echo rollback-netplan vm=ghost-observability-node if=ens4
```

## p4-vm-17
```bash
bash -lc echo no-op
```

## p4-vm-18
```bash
bash -lc echo rollback-netplan vm=ghost-edge-failover-1 if=ens3
```

## p4-vm-19
```bash
bash -lc echo rollback-netplan vm=ghost-edge-failover-1 if=ens4
```

## p4-vm-20
```bash
bash -lc echo no-op
```

## p4-vm-21
```bash
bash -lc echo rollback-netplan vm=ghost-edge-failover-2 if=ens3
```

## p4-vm-22
```bash
bash -lc echo rollback-netplan vm=ghost-edge-failover-2 if=ens4
```

## p4-vm-23
```bash
bash -lc echo no-op
```

## p4-vm-24
```bash
bash -lc echo rollback-netplan vm=ghost-edge-failover-3 if=ens3
```

## p4-vm-25
```bash
bash -lc echo rollback-netplan vm=ghost-edge-failover-3 if=ens4
```

## p5-docker-26
```bash
bash -lc docker network rm ghost-devnet || true
```
