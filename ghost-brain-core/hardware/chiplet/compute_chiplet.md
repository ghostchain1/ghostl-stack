# GhostBrain Compute Chiplet — Design Specification

## Overview

The GhostBrain Compute Chiplet is a custom ASIC designed at TSMC 7nm FF (FinFET)
for efficient deep-learning inference with GhostChain governance awareness.
It is the Phase 4 execution target in the GhostBrain hardware roadmap.

**Key Figures:**
| Parameter | Value |
|---|---|
| Process | TSMC 7nm FF (N7) |
| Die area | ~800 mm² (max reticle limit) |
| Transistors | ~25 billion |
| Peak FP16 perf | 512 TFLOPS |
| Peak INT8 perf | 1024 TOPS |
| Peak BW | 3.6 TB/s (8× HBM3 stacks) |
| SRAM on-die | 256 MB distributed SRAM |
| TDP | 300 W |
| Chiplet I/O | UCIe 2.0 Gen3 at 3.2 Tb/s aggregate |
| HBM interface | 8× HBM3 per chiplet, 512-bit wide each |

---

## Die Floorplan

```
┌──────────────────────────────────────────────────┐
│          I/O Ring (UCIe + HBM PHY pads)          │
│  ┌────────────────────────────────────────────┐  │
│  │              Tensor Core Array              │  │
│  │   ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐  │  │
│  │   │ TC 0,0│ │TC 0,1 │ │TC 0,2 │ │TC 0,3 │  │  │
│  │   └───────┘ └───────┘ └───────┘ └───────┘  │  │
│  │        ... 4×4 tile mesh (16 total) ...     │  │
│  │  ┌────────────────────────────────────────┐  │  │
│  │  │      4×4 XY-Routed NoC Fabric           │  │  │
│  │  └────────────────────────────────────────┘  │  │
│  ├────────────────────────────────────────────┤  │
│  │  Sparse Core Array │  DMA Engine   │  PCU  │  │
│  ├────────────────────┼───────────────┼───────┤  │
│  │  SRAM Banks (16×16 MB = 256 MB total)      │  │
│  ├────────────────────────────────────────────┤  │
│  │  HBM3 Controllers (8 channels, 512-bit)    │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## Block Descriptions

### Tensor Core Array (16 tiles)
- Each tile: 16×8×16 systolic array (see `hardware/fpga/tensor_tile.v`)
- Supported precision: FP16, BF16, INT8, INT4
- 128 MACs per tile per cycle × 16 tiles × 4 GHz = 512 TFLOPS (FP16)
- Tile-local 16 MB SRAM for weight buffering

### Sparse Core Array (8 lanes)
- 2:4 structured sparsity decoders (see `hardware/fpga/sparse_tile.v`)
- 2× throughput vs. dense at equal area
- Connects to tensor cores via NoC for A-tile redistribution

### NoC Fabric
- 4×4 mesh, XY routing, 8 VCs
- 512-bit links at 4 GHz = 256 GB/s per link, 8 GB/s bisection per tile
- See `hardware/fpga/noc_router.v` for router RTL

### DMA Engine
- 4 independent DMA channels (see `hardware/fpga/dma_engine.v`)
- AXI4-512 to HBM / UCIe / SRAM
- Descriptor FIFO depth: 64

### Power Control Unit (PCU)
- Per-tile DVFS (dynamic voltage/frequency scaling)
- Thermal sensor readout (10-bit ADC × 32 sensors)
- Emergency throttle: junction temp > 95°C → reduce freq 25%/step

---

## Memory Subsystem

| Level | Capacity | Bandwidth | Latency |
|---|---|---|---|
| Tile SRAM (L1) | 16 MB per tile (256 MB total) | 12 TB/s aggregate | 2 cycles |
| NoC-reachable SRAM (L2) | All 256 MB via NoC | ~3.2 TB/s | 5–20 cycles |
| HBM3 (8 stacks) | 96 GB | 3.6 TB/s | 50 cycles |
| Host DRAM (via UCIe) | Unlimited | 64 GB/s | 200+ cycles |

---

## Power Budget (300 W TDP)

| Domain | Static Power | Dynamic (Peak) |
|---|---|---|
| Tensor Cores (16) | 30 W | 180 W |
| Sparse Cores (8) | 10 W | 50 W |
| NoC Fabric | 5 W | 20 W |
| SRAM banks | 15 W | 25 W |
| HBM PHY (8×) | 8 W | 16 W |
| PCU + misc | 3 W | 9 W |
| **Total** | **71 W** | **300 W** |

---

## Governance Integration

The chiplet runs a hardware-enforced governance check on every computation
batch. A 128-bit **governance nonce** is embedded in each DMA descriptor;
the PCU validates it against a one-time-programmable (OTP) register.

- Nonces are updated via a signed firmware update packet that originates from
  the GhostChain L1 governance contract (`GhostChainGovernor`).
- Mismatched nonces → DMA is halted, audit event emitted via UCIe sideband.
- This ensures that every tensor computation is traceable to a ratified
  on-chain governance decision.

---

## Thermal Design

- 0.35 °C/W junction-to-ambient (forced air cooling)
- 0.10 °C/W with high-performance TIM + vapour chamber
- Max junction: 105 °C; throttle onset: 95 °C
- Per-tile thermal sensors sampled every 1 ms
- See `simulator/power_model/thermal_model.py` for transient simulation

---

## Verification Plan

| Milestone | Method |
|---|---|
| RTL gate-level simulation | VCS + UVM testbenches |
| Formal equivalence checking | Cadence Jasper GoldBar |
| Power analysis | Synopsys PrimePower (pre-Si) |
| FPGA prototype validation | Xilinx VU13P (Phase 3 proxy) |
| Post-Si characterisation | ATE vector replay vs. RTL sim |
