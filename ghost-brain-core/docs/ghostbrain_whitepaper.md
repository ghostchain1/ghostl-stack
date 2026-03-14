# GhostBrain: Autonomous AI Compute for GhostChain

**Technical Whitepaper — v0.9 (Pre-Mainnet)**

---

## Abstract

GhostBrain is the AI compute primitive of the GhostChain ecosystem. It
combines a custom 7-nanometre AI chiplet, an MLIR-based tensor compiler
(GhostTensor dialect), a TypeScript inference runtime anchored to
GhostChain L1 governance, and a Rust-based hardware security subsystem.

GhostBrain processes GhostChain L2 transaction classifications, fulfils
GhostL3 on-chain inference requests, and generates autonomous governance
proposals — all ratified by human quorum before on-chain execution.

No private keys exist on GhostBrain. All economic decisions use GST
(Ghost Standard Token) exclusively. All cross-chain communication routes
through GhostChain L1 (chain ID 14000101); GhostL2 and GhostL3 are
accessed only via their upstream L1 anchor.

---

## 1. Motivation

Blockchain AI integrations have historically relied on naive voting
schemes, off-chain oracle aggregation without cryptographic provenance,
and models trained on data inaccessible for audit. GhostBrain is
designed from first principles to address three failure modes:

1. **Unconstrained autonomy** — AI must not self-execute economic
   transactions without human governance confirmation.
2. **Key custody risk** — AI compute infrastructure must not hold
   signing keys; compromise of the AI layer must not compromise
   the chain's economic security.
3. **Opaque inference** — every AI decision must produce a
   cryptographically signed, append-only audit trail, verifiable
   on GhostScan.

---

## 2. Hardware Architecture

### 2.1 Chiplet Specification

| Parameter              | Value |
|---|---|
| Process node           | 7nm (TSMC N7) |
| AI Tensor Cores        | 16 tiles, INT8 / FP16 |
| Sparse accelerators    | 8 cores (2:4 structured sparsity) |
| FP16 throughput        | 512 TFLOPS peak |
| INT8 throughput        | 1024 TOPS peak |
| On-die SRAM            | 256 MB (8 banks × 32 MB, SECDED ECC) |
| HBM3 capacity          | 96 GB (8 channels) |
| HBM3 bandwidth         | 3.6 TB/s |
| Chip-to-chip (UCIe)    | 2 TB/s aggregate |
| TDP (AI workload)      | 675 W |

### 2.2 Microarchitecture Overview

```
  HBM3 [8 × 12 GB]
       │
  ┌────┴──────────────────────────────────────────────┐
  │  Memory Controller + ECC Engine (SECDED, 72-bit)  │
  └────┬──────────────────────────────────────────────┘
       │
  ┌────┴──────────────────────────────────────────────┐
  │      On-Die SRAM Crossbar (256 MB, 8 banks)      │
  └────┬──────────────────────┬────────────────────────┘
       │                      │
┌──────┴──────┐        ┌──────┴──────┐
│ TC Cluster 0│        │ TC Cluster 1│   (× 4 clusters total)
│  4 TC tiles │        │  4 TC tiles │
│  2 Sparse   │        │  2 Sparse   │
└─────────────┘        └─────────────┘
       │                      │
  ┌────┴──────────────────────┴────┐
  │     NoC Mesh (4×4, 512 GB/s)  │
  └────────────────────────────────┘
       │
  ┌────┴──────────┐
  │  DMA Engine   │  ← 4 channels, CRC-32C verified
  │  PCIe Gen 5   │
  └───────────────┘
```

### 2.3 Rack Topology

An inference cluster rack contains 8 GhostBrain nodes connected via
UCIe (2 TB/s chip-to-chip) through a CXL 3.0 switch fabric. Each node
exposes a stable Kubernetes identity via StatefulSet with headless DNS
(`ghost-brain-N.ghost-brain-headless.ghostbrain.svc.cluster.local`).

---

## 3. GhostTensor Compiler

### 3.1 Pipeline

```
Source (Python AST / ONNX / TorchFX)
  │
  ▼
GhostIR (MLIR text, GhostTensor dialect)
  │
  ├─ ParsePass         — syntax + type checking
  ├─ FusionPass        — merge compute-bound op sequences
  ├─ TilingPass        — tile to fit 256 MB on-die SRAM
  ├─ SparsityPass      — apply 2:4 structured pruning (optional)
  ├─ QuantizationPass  — FP16→INT8 per-channel (optional)
  └─ CodegenPass       → { CPU BLAS | GPU cuBLAS | FPGA DMA | Chiplet ISA }
```

### 3.2 Operator Fusion

The fusion pass recognises and collapses high-value patterns:

| Pattern                            | Fused Op |
|---|---|
| LayerNorm + GELU + Linear          | FusedLNGELULinear |
| Softmax + Dropout + MatMul         | FusedAttention |
| Embedding + Gather + Positional    | FusedEmbedding |
| Linear + Bias + ReLU               | FusedLinearBiasReLU |

Fusion eligibility is gated by the roofline model: only fuse when the
combined operation is memory-bound (arithmetic intensity < ridge point).

### 3.3 Quantization

Per-channel symmetric INT8 quantization with software-computed calibration
scales. Scales are stored alongside the compiled kernel and verified by the
firmware manifest before deployment.

```
scale_c = max(|W_c|) / 127.0
W_q_c   = clamp(round(W_c / scale_c), -127, 127)
```

Reconstruction error is bounded: |dequant(quant(w)) − w| < 2^(-7) × max(|W|).

### 3.4 Structured Sparsity (2:4)

Within every group of 4 consecutive weights, 2 are pruned to zero and
a 2-bit selector mask is stored. The chiplet tensor cores decompress
2:4 sparse operands at line rate with no throughput penalty.

Effective speedup for INT8 ops: 2× over dense at equal accuracy degradation
of < 0.5% on standard language model benchmarks.

---

## 4. Inference Runtime

### 4.1 API

The runtime exposes REST on port 7900 and a management sideband on port 7901.
Key endpoints:

| Method | Path                    | Description |
|---|---|---|
| GET    | `/health`               | Liveness — 200 if runtime alive |
| GET    | `/ready`                | Readiness — 200 if attestation verified + block synced |
| POST   | `/v1/infer`             | Execute inference |
| POST   | `/v1/classify`          | Classify GhostL2 transaction risk |
| POST   | `/v1/governance/propose`| Submit unsigned governance proposal |
| GET    | `/attestation`          | Return latest Ed25519 attestation quote |

See `docs/runtime_api.md` for full request/response schemas.

### 4.2 Paged KV Cache

Long-context inference uses a paged KV cache partitioned into 2 MB
pages backed by HBM3. The page table is pinned in on-die SRAM. Pages
are evicted LRU and never swapped to host memory; eviction is logged to
the HMAC-signed event log.

Maximum context length: 131 072 tokens (128K) at FP16, or 262 144 at
INT8 with 2:4 sparse attention.

### 4.3 Governance Priority Scheduler

Inference requests from GhostL3 on-chain events are assigned
`priority: 100`. Background batch jobs receive `priority: 1`. The
scheduler is a max-heap over (priority, FIFO order).

Governance proposal generation always preempts active inference. No
autonomous transaction is ever submitted without the request first being
queued through the scheduler and then forwarded to the signing relay for
human ratification.

---

## 5. Security Model

### 5.1 Key Hierarchy

```
eFuse Root Secret (burnt at manufacture, never exported)
  │
  └─ HKDF-SHA256("chip-identity")
       │
       ├─ Ed25519 Identity Key  ← attestation signing
       └─ HKDF-SHA256("sram-xts")
            │
            └─ AES-256-XTS key  ← on-die memory encryption
                 │
                 └─ KEK (from HashiCorp Vault KV v2)
                        └─ Wrapped by HSM at manufacture
```

### 5.2 Attestation

On boot, the bootloader (`security/secure_boot/bootloader.rs`):
1. Reads eFuse root secret.
2. Derives identity Ed25519 key via HKDF.
3. Fetches the firmware manifest from L1 firmware registry
   (`0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422`) via `ghost_call`.
4. Verifies BLAKE3 hash of each firmware component against the manifest.
5. Signs the attestation quote with the Ed25519 identity key.
6. Locks boot — no further firmware changes until governance quorum.

Remote attestation (`security/attestation/remote_attestation.ts`) issues
a 32-byte random challenge, sends it to the chip, and verifies the
returned signed response against the on-chain public key registry.

### 5.3 Memory Encryption

All HBM3 and on-die SRAM contents are encrypted via AES-256-XTS.
The XTS key is derived from the eFuse root secret and never leaves the
die in plaintext. Host-side simulation uses WebCrypto AES-CTR as a
placeholder (marked `/* SIMULATION ONLY */`).

### 5.4 Key Manager

`security/encryption/key_manager.ts` fetches the Key Encryption Key
(KEK) from HashiCorp Vault KV v2 on startup and derives per-purpose
keys via HKDF-SHA256. Key rotation requires a L1 governance nonce
confirmation via `ghost_call` before the new key is applied. On SIGTERM,
all key material is zeroed from memory.

---

## 6. Reliability

### 6.1 ECC (SECDED)

All 256 MB on-die SRAM uses 72-bit SECDED codewords (64 data + 8 parity).
The ECC controller (`reliability/ecc_controller.cpp`) automatically
corrects single-bit errors and signals UED for double-bit errors. A
background thread scrubs all SRAM every 24 hours. CE counts > 1000
trigger an alert callback, which routes to `predictive_failure_ai.ts`.

### 6.2 Fault Detection

Power-on reset runs a battery of structural tests:
- **March-C-** for stuck-at and transition faults in SRAM
- **PRBS-31 BER** for NoC link integrity (threshold 10⁻¹²)
- **CRC-32C DMA verification** on all 4 DMA channels
- **Systolic array KAT** (known-answer test, 4×4 identity matrix)

Any fault causes the node to return `503 Not Ready` and submit a
hardware alert governance proposal via the signing relay.

### 6.3 Predictive Failure AI

`reliability/predictive_failure_ai.ts` maintains a 1-hour rolling
window of health samples (thermal, ECC counts, voltage droop, NoC BER,
heartbeat status). A logistic regression classifier produces a failure
probability, estimated time-to-failure, and dominant failure mode.

When probability > 0.7, a governance alert is posted to L1 via
`ghost_call`. The alert is informational — no autonomous remediation
occurs. A human operator must ratify any hardware intervention proposal
through `GhostChainGovernor`.

---

## 7. GhostChain Integration

### 7.1 L1 Bridge

`integration/ghostchain_bridge.ts` connects to GhostChain L1
(chain ID 14000101, port 18545) using `ghost_call` exclusively.
Key operations:
- `fetchFirmwareManifest()` — verify current firmware hash against L1 registry
- `submitGovernanceProposal()` — post unsigned calldata to signing relay
- `logTelemetryToL1()` — write AI telemetry on-chain (selector `f1a2b3c4`)
- `pollGovernanceEvents()` — subscribe to L1 governance events affecting GhostBrain

### 7.2 L2 Sequencer Monitor

`integration/ghostl2_runtime.ts` monitors GhostL2 (chain ID 901) for
new blocks. Each block's transactions are sent to `/v1/classify` for risk
scoring. If the L2 unsafe head is more than 1000 blocks ahead of the L1
submitted block (from the finality oracle at
`0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A`), a finality divergence
alert is generated.

### 7.3 L3 Inference Gateway

`integration/ghostl3_inference_gateway.ts` subscribes to `InferenceRequested`
events on GhostL3 (chain ID 903). For each event, it calls
`/v1/infer` with `priority: 100` and fulfils the result on-chain via the
signing relay (selector `0xb1c2d3e4`). L3 is the only chain where
GhostBrain results are written back on-chain; all other chains receive
only read access or unsigned proposals.

### 7.4 Event Log

Every AI inference, classification, governance proposal, and hardware
alert is written to an HMAC-SHA256 signed append-only JSONL log.
The log is rotated daily, pushed to GhostScan indexer, and permanently
archived to decentralised storage via the L1 telemetry function.

---

## 8. Governance Integration

GhostBrain participates in on-chain governance in two read/write modes:

| Mode  | GhostBrain action               | Human action required |
|---|---|---|
| Read  | Poll `GovernanceEvent` log      | None |
| Write | Submit unsigned proposal calldata | Ratify via GhostChainGovernor quorum + timelock |

The Governor contract (`0xad32D5C2Da9f4159C4cc98686C005852b3905355`)
enforces quorum and timelock. GhostBrain never directly executes
governance transactions.

---

## 9. Roadmap

| Phase | Target         | Milestone |
|---|---|---|
| 0     | ✅ Complete    | Repository skeleton, compilation pipeline, CPU simulator |
| 1     | Q3 2025        | FPGA integration, real ECC hardware validation, Vault HSM integration |
| 2     | Q1 2026        | GhostBrain ASIC tape-out (7nm N7), first silicon bring-up |
| 3     | Q3 2026        | Rack-scale inference cluster (8-node), mainnet L3 inference settlement |
| 4     | Q1 2027        | Next-gen chiplet (4nm), 4× TFLOPS, photonic UCIe interconnect |

---

## Appendix: Key Addresses

| Contract / Oracle          | Address |
|---|---|
| L1 Finality Oracle         | `0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422` |
| L1 Rollup / Governor       | `0xad32D5C2Da9f4159C4cc98686C005852b3905355` |
| L2 Finality Oracle         | `0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A` |
| L3 Finality Oracle         | `0x87F850cbC2cFfac086F20d0d7307E12d06fA2127` |
| L2→L3 Rollup               | `0x130A46b6E41DB6E1e18fb9c759F223c459190e90` |

---

*This whitepaper describes pre-mainnet architecture subject to change
through the GhostChain governance process. All specifications are
ratified on-chain before deployment.*
