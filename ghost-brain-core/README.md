# GhostBrain Core

> Autonomous AI compute infrastructure for the GhostChain ecosystem.
> Chain-anchored. Human-ratified. No private keys on hardware.

---

## Overview

GhostBrain is the AI compute layer of [GhostChain](https://ghostchain.cloud).
It combines a custom 7nm AI chiplet, an MLIR tensor compiler
(GhostTensor dialect), a TypeScript inference runtime anchored to
GhostChain L1 governance, and a Rust hardware security subsystem.

Core properties:
- **Chain-anchored** — all firmware and governance decisions verified against
  GhostChain L1 (chain ID 14000101) via `ghost_call`
- **Human-ratified** — GhostBrain proposes; `GhostChainGovernor` quorum ratifies
- **No private keys on hardware** — signing delegated to human-operated relay
- **GST-only** — no non-GST token integrations
- **Auditable** — every AI decision written to HMAC-signed append-only log

---

## Directory Structure

```
ghost-brain-core/
├── architecture/              # Hardware specs, memory map, power model
│   ├── chip_spec.md
│   ├── memory_hierarchy.md
│   ├── power_model.md
│   └── ...
├── compiler/                  # GhostTensor MLIR compiler (C++, LLVM 18)
│   ├── dialect/               # Op definitions (.td), C++ implementation
│   ├── transforms/            # Fusion, tiling, quantize, sparsity passes
│   └── backend/               # CPU / GPU / FPGA / chiplet emitters
├── runtime/                   # TypeScript inference runtime (port 7900)
│   ├── api_server.ts          # Express 5 REST API
│   ├── inference_engine.ts    # Kernel dispatch + KV cache
│   ├── kv_cache.ts            # Paged 2 MB KV cache
│   └── scheduler.ts           # Max-heap priority scheduler
├── simulator/                 # C++ cycle-accurate simulator
│   ├── cycle_sim.cpp
│   ├── roofline/              # Python roofline model
│   └── ...
├── benchmarks/                # Python MLPerf + transformer + recommender
│   ├── mlperf/
│   ├── transformer/
│   ├── recommender/
│   └── graph/
├── hardware/                  # Verilog RTL
│   ├── systolic_array.v       # 16×8×16 tensor core array
│   ├── dma_engine.v           # 4-channel DMA + CRC-32C
│   ├── noc_router.v           # 4×4 mesh network-on-chip
│   └── ...
├── security/                  # Secure boot + attestation + encryption
│   ├── secure_boot/           # bootloader.rs, firmware_verifier.rs
│   ├── attestation/           # chip_identity.rs, remote_attestation.ts
│   └── encryption/            # memory_encryption.ts, key_manager.ts
├── reliability/               # ECC, fault detection, health monitoring
│   ├── ecc_controller.cpp     # SECDED for 256 MB SRAM
│   ├── fault_detector.cpp     # March-C-, PRBS-31, DMA CRC, KAT
│   ├── health_monitor.cpp     # Thermal / ECC / power / link / heartbeat
│   └── predictive_failure_ai.ts
├── integration/               # GhostChain L1/L2/L3 bridges
│   ├── ghostchain_bridge.ts   # L1 governance + telemetry
│   ├── ghostl2_runtime.ts     # L2 TX classification monitor
│   ├── ghostl3_inference_gateway.ts  # L3 on-chain inference fulfillment
│   └── ai_event_logger.ts     # HMAC-signed JSONL audit log
├── infrastructure/            # Docker + Kubernetes
│   ├── docker/                # Dockerfile.runtime / .simulator / .compiler
│   ├── compose/               # docker-compose-ghostbrain.yml
│   └── kubernetes/            # Deployment + StatefulSet + HPA
├── ci/                        # GitHub Actions
│   ├── pipeline.yml           # Main CI (TypeScript, Rust, C++, Python)
│   ├── benchmark-ci.yml       # Nightly benchmark regression
│   └── security-audit.yml     # Weekly cargo-audit + Semgrep + Gitleaks
└── docs/
    ├── runtime_api.md         # REST API reference
    ├── compiler_design.md     # GhostTensor dialect + passes + backends
    ├── developer_guide.md     # Onboarding + env vars + chain patterns
    └── ghostbrain_whitepaper.md  # Architecture whitepaper
```

---

## Quick Start

```bash
# Prerequisites: Node >= 22.21.0 <23, Rust stable, LLVM 18, Python 3.11, Docker

# Install
npm install

# Start full stack (runtime + simulator + compiler + Vault + Prometheus + Grafana)
docker compose -f infrastructure/compose/docker-compose-ghostbrain.yml up -d

# Health check
curl http://localhost:7900/health
```

---

## Key Commands

### TypeScript Runtime

```bash
npm run build          # compile TypeScript
npx tsc --noEmit       # type-check only
npx eslint runtime/ integration/ security/
npm test               # unit tests
```

### Rust Security

```bash
cd security
cargo build --release
cargo test
cargo clippy -- -D warnings
```

### C++ Reliability + Simulator

```bash
# Build & self-test
g++ -std=c++17 -O2 -o reliability/ecc_controller reliability/ecc_controller.cpp
./reliability/ecc_controller --self-test

g++ -std=c++17 -O2 -o reliability/fault_detector reliability/fault_detector.cpp
./reliability/fault_detector --self-test

# Cycle-accurate simulator
cd simulator && make && ./cycle_sim
```

### Python Benchmarks

```bash
python3 benchmarks/mlperf/ghostbrain_mlperf.py
python3 benchmarks/transformer/llama_benchmark.py
python3 benchmarks/roofline/roofline_model.py
```

---

## Architecture Diagram

```
GhostChain L1  (chain_id=14000101, :18545)
  ├── Firmware Registry   0x7B3Be2...
  ├── Governor            0xad32D5...
  └── Telemetry log       ghost_call f1a2b3c4
         │
         │  ghost_call (not eth_call)
         ▼
GhostBrain Runtime  (:7900)
  ├── POST /v1/infer          ← GhostL3 InferenceRequested events
  ├── POST /v1/classify       ← GhostL2 new block TX batches
  └── POST /v1/governance/propose  → Signing Relay (:7910) → L1
         │
         ▼
GhostL2  (chain_id=901, :29545)
  └── Finality Oracle  0x650aEF...

GhostL3  (chain_id=903, :39545)
  └── Inference Gateway  $INFERENCE_GW_L3
```

---

## Service Ports

| Service                | Port |
|---|---|
| GhostBrain API         | 7900 |
| GhostBrain sideband    | 7901 |
| Signing Relay          | 7910 |
| Simulator API          | 7920 |
| Compiler Daemon        | 7930 |
| GhostChain L1 RPC      | 18545 |
| GhostL2 RPC            | 29545 |
| GhostL3 RPC            | 39545 |
| HashiCorp Vault        | 8200 |
| Prometheus             | 9090 |
| Grafana                | 3000 |

---

## Security

- Firmware verified against L1 registry on every boot
- Ed25519 attestation keypair derived from eFuse — never exported
- AES-256-XTS transparent HBM3 + SRAM encryption
- All signing delegated to human signing relay — GhostBrain holds no keys
- HMAC-SHA256 signed append-only event log for every AI decision
- Weekly CI security audit: `cargo-audit`, Semgrep SAST, OWASP Dependency-Check, Gitleaks

---

## Docs

- [Runtime API Reference](docs/runtime_api.md)
- [Compiler Design](docs/compiler_design.md)
- [Developer Guide](docs/developer_guide.md)
- [Technical Whitepaper](docs/ghostbrain_whitepaper.md)

---

## License

Proprietary — GhostChain Foundation. All rights reserved.
