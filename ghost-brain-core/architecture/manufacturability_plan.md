# GhostBrain — Manufacturability Plan

## Phase Roadmap

### Phase 1 — CPU Runtime (Immediate, $0 additional hardware)
- Runs entirely on existing GhostStack server infrastructure
- Docker-containerised runtime (`infrastructure/docker/Dockerfile.runtime`)
- No supply chain risk; deploys today

### Phase 2 — GPU Acceleration (3–6 months)
- Off-the-shelf NVIDIA A100 / H100 or AMD MI300X
- Standard PCIe host integration; no custom hardware
- Procurement: standard server channels (Dell, Supermicro)
- Risk: GPU supply availability (mitigated by CPU fallback)

### Phase 3 — FPGA Tensor Tile (6–14 months)
- Target device: AMD/Xilinx Alveo U280 or Intel Stratix 10 MX
- RTL at `hardware/fpga/tensor_tile.v` (synthesisable with Vivado / Quartus)
- Bitstream signed and stored on GhostChain L1 (integrity via firmware_verifier.rs)
- Procurement: standard FPGA board channel
- Risk: long lead times (mitigated by dual-vendor FPGA sourcing)

### Phase 4 — Custom Chiplet (18–36 months)
- Process: TSMC 7 nm (N7) or Samsung 4 nm (S4E) depending on availability
- HBM3 stack: SK Hynix or Micron
- Interposer: CoWoS (TSMC) for chiplet-to-HBM connection
- EDA: Cadence Innovus (placement), Synopsys IC Compiler II (routing)
- NDA / shuttle: MPW shuttle via TSMC Open Innovation Platform for prototype
- First tape-out budget estimate: $15–25M
- Risk: yield (mitigated by ECC + spare columns), supply chain (dual-foundry design)

### Phase 5 — AI Cluster Rack (36–60 months)
- 8–16 Phase 4 chiplets per node, 4–8 nodes per rack
- Custom backplane with RoCEv2 fabric (Mellanox / Broadcom Tomahawk ASIC)
- Mechanical: 2U per node, standard 42U rack
- Power: 48V DC distribution, custom VRMs
- Thermal: liquid cooling (direct-to-chip or immersion)
- Colocation: GhostChain data centre or sovereign cloud

## Supply Chain Risk Matrix

| Component     | Single-source Risk | Mitigation                        |
|---------------|--------------------|-----------------------------------|
| FPGA boards   | High               | Dual-vendor (AMD + Intel)         |
| HBM3 stacks   | High               | Qualified with SK Hynix + Micron  |
| TSMC 7nm      | Medium             | Shuttle + Samsung backup design   |
| PCB substrate | Low                | Multiple ODM vendors              |
| Cooling       | Low                | Standard CDU connectors           |

## Governance Approval Requirements

Any hardware procurement above **10,000 GST equivalent** requires a GhostChainGovernor
proposal with human quorum.  Procurement contracts are stored as IPFS CIDs in the governance
calldata for on-chain auditability.

## Quality Gates

| Gate | Requirement |
|------|-------------|
| G1 (FPGA prototype) | Passes full benchmark suite (`benchmarks/`) at ≥ 90% of spec |
| G2 (ASIC tape-out) | Sign-off from `formal/slither` + `formal/echidna` equivalent for RTL |
| G3 (cluster bring-up) | 72-hour burn-in, ECC error rate < 1e-15 per bit per hour |
