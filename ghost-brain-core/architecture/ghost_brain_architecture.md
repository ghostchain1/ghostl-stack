# GhostBrain Core — System Architecture

## Overview

GhostBrain Core is the AI compute and control plane for the GhostStack ecosystem. It provides
autonomous infrastructure management, AI inference, governance assistance, fraud detection,
validator health monitoring, treasury optimisation, and network management for GhostChain L1,
GhostL2, and GhostL3.

```
┌────────────────────────────────────────────────────────────────────┐
│                        GhostBrain Core                             │
│                                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ AI Compute  │  │  AI Runtime  │  │  Governance / Compliance │  │
│  │   Engine    │  │  Controller  │  │       Interface          │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                │                       │                 │
│  ┌──────▼──────────────────────────────────────────────────────┐   │
│  │                   GhostBrain Kernel Bus                     │   │
│  │  Policy Engine · Sim Evaluator · Audit · Metrics Exporter   │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
│         │                                                          │
│  ┌──────▼──────────────────────────────────────────────────────┐   │
│  │               Chain Integration Layer                        │   │
│  │  L1 Bridge · L2 Runtime · L3 Inference Gateway · Logger     │   │
│  └──────┬──────────────────────────────────────────────────────┘   │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│                  GhostChain Stack                   │
│  L1 (14000101 :18545)  L2 (901 :29545)  L3 (903 :39545) │
└─────────────────────────────────────────────────────┘
```

## Component Hierarchy

### Layer 0 — Hardware Substrate
- CPU runtime (Phase 1, immediate)
- GPU acceleration (Phase 2)
- FPGA tensor tiles (Phase 3)
- Custom chiplet compute die (Phase 4)
- AI cluster rack (Phase 5)

### Layer 1 — Compiler
- GhostTensor MLIR dialect (`ghosttensor`) — custom IR for tensor operations
- Optimizer passes: kernel fusion, tiling, sparsity, quantisation
- Backend codegen targeting CPU/FPGA/chiplet

### Layer 2 — Runtime
- Kernel scheduler with priority queue
- Tensor memory allocator + KV cache manager
- Distributed collective communications (AllReduce, AllToAll, Broadcast)
- Runtime controller orchestrating kernel execution

### Layer 3 — Simulator
- Cycle-accurate tensor core, sparse core, NoC, and memory simulators (C++)
- Power/thermal model
- Roofline model for performance prediction

### Layer 4 — AI Services (services/ghostbrain-core)
- Infrastructure supervisor
- Policy engine (governance constraints)
- Safety evaluator (simulation-gated execution)
- Benchmark harness (decision quality + latency)
- Audit log (JSONL + L2 webhook)

### Layer 5 — Chain Integration
- `ghostchain_bridge.ts` — sends AI-generated proposals to L1 governor
- `ghostl2_runtime.ts` — monitors L2 sequencer health, triggers GhostBrain evaluations
- `ghostl3_inference_gateway.ts` — routes L3 AI inference requests
- `ai_event_logger.ts` — durable event log shipped to GhostScan

## Chain Routing Law

All cross-chain traffic from GhostBrain is routed **exclusively through GhostChain L1**.
GhostL2 and GhostL3 never communicate with external chains directly.

```
GhostBrain → L1 Governor (14000101)
          → L2 via L1GhostPortal (settlement)
          → L3 via L2 bridge
```

## Token Policy

- Gas token: **GST** (no ETH, WETH, or external tokens)
- GhostBrain holds no private keys; audit/proposal relay uses HTTP webhook pattern to a separate key-holding service

## Governance Contract

```
AI writes proposals → GhostBrain proposes via GhostChainGovernor
                   → Human quorum ratification required
                   → No autonomous on-chain execution without quorum
```

## Port Reference

| Service              | Port |
|----------------------|------|
| GhostBrain Core API  | 7900 |
| L1 RPC               | 18545 |
| L2 RPC               | 29545 |
| L3 RPC               | 39545 |
