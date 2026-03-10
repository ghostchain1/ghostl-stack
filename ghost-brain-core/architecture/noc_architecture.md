# GhostBrain — Network-on-Chip (NoC) Architecture

## Overview

The on-chip interconnect for Phase 4+ chiplets uses a **2D mesh NoC** with wormhole routing.
This document describes the topology, routing algorithm, flow control, and mapping of AI
workloads to NoC endpoints.

## Topology

```
┌───┐  ←→  ┌───┐  ←→  ┌───┐  ←→  ┌───┐
│TC0│      │TC1│      │TC2│      │TC3│
└─┬─┘      └─┬─┘      └─┬─┘      └─┬─┘
  ↕           ↕           ↕           ↕
┌─┴─┐  ←→  ┌─┴─┐  ←→  ┌─┴─┐  ←→  ┌─┴─┐
│TC4│      │TC5│      │TC6│      │TC7│
└─┬─┘      └─┬─┘      └─┬─┘      └─┬─┘
  ↕           ↕           ↕           ↕
┌─┴─┐  ←→  ┌─┴─┐  ←→  ┌─┴─┐  ←→  ┌─┴─┐
│SC0│      │SC1│      │HBM0│     │HBM1│
└─┬─┘      └─┬─┘      └─┬──┘     └─┬──┘
  ↕           ↕           ↕           ↕
┌─┴─┐  ←→  ┌─┴─┐  ←→  ┌─┴──┐  ←→  ┌─┴──┐
│PCIe│     │DMA │     │HBM2│       │HBM3│
└────┘      └────┘      └────┘      └────┘

TC = Tensor Core, SC = Sparse Core, HBM = Memory Stack
```

- Grid size: 4×4 (16 nodes), expandable to 8×8 (64 nodes) in Phase 5 chiplet interconnect
- Link width: 512-bit bidirectional per direction (N/S/E/W)
- Link frequency: 4 GHz
- Peak bisection bandwidth: 8 TB/s

## Routing Algorithm

- **XY routing** (deterministic): route along X-axis first, then Y-axis
- Deadlock-free by construction (no cyclic dependency in XY order)
- Adaptive routing (opt-in, Phase 5): detour around congested links using ECMP

## Flow Control

- **Wormhole switching**: header flit routes, body/tail flits follow
- Credit-based flow control: 8 virtual channels per link, 4 credits/VC
- QoS: VC0 = governance (highest priority), VC1-3 = inference, VC4-6 = data movement, VC7 = background

## Packet Format

```
[ Header: 4 flits ]
  - Destination (X, Y) : 8 bits
  - Source (X, Y)      : 8 bits
  - Packet ID          : 16 bits
  - VC                 : 3 bits
  - Payload size       : 13 bits

[ Payload: 0–512 flits of 64 bytes each ]

[ Tail: 1 flit ]
  - CRC32 : 32 bits
```

## Simulator

The cycle-accurate NoC simulator is at `simulator/cycle_simulator/noc_sim.cpp`.
It models:
- Wormhole routing latency per hop (2 clock cycles base)
- Credit propagation delay
- Congestion backpressure
- CRC error injection for reliability testing

## Workload Mapping

| Workload            | Preferred Nodes     | VC  |
|---------------------|---------------------|-----|
| Governance eval     | TC0, TC1            | 0   |
| Matrix multiply     | TC0–TC7             | 1   |
| Sparse embedding    | SC0, SC1            | 2   |
| KV cache load       | HBM0–HBM3           | 3   |
| Host DMA            | PCIe, DMA           | 4–6 |
| Benchmark           | All (background)    | 7   |
