# GhostBrain Compiler Design

## Overview

The GhostBrain compiler transforms neural network computation graphs
into optimised native code for GhostBrain hardware targets (CPU BLAS,
GPU cuBLAS, FPGA tensor tiles, and the custom 7nm chiplet).

The compiler is built on MLIR with a custom **GhostTensor dialect** that
captures AI-specific semantics: tensor shapes, quantization annotations,
sparsity metadata, and GhostChain governance nonces for verified execution.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GhostBrain Compiler                      │
│                                                                 │
│  ┌──────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│  │  Frontend │   │   Optimizer    │   │      Backend        │  │
│  │          │   │                │   │                     │  │
│  │Python AST│──▶│ Fusion Pass    │──▶│ CPU  (BLAS/OpenBLAS)│  │
│  │ONNX      │   │ Tiling Pass    │   │ GPU  (cuBLAS/XLA)   │  │
│  │TorchFX   │   │ Quantize Pass  │   │ FPGA (DMA dispatch) │  │
│  │GhostIR   │   │ Sparsity Pass  │   │ Chiplet (tile ISA)  │  │
│  └──────────┘   └────────────────┘   └─────────────────────┘  │
│                                                                 │
│  All passes operate on the GhostTensor MLIR dialect.           │
└─────────────────────────────────────────────────────────────────┘
```

---

## GhostTensor MLIR Dialect

### Types

| Type                        | Description |
|---|---|
| `ghost.tensor<DxD, f16>`    | Dense FP16 tensor |
| `ghost.tensor<DxD, i8>`     | INT8 quantised tensor |
| `ghost.sparse<DxD, 2:4>`    | 2:4 structured sparse tensor |
| `ghost.tensor<DxD, f32>`    | Accumulator (not transmitted) |

### Operations

| Op                      | Description |
|---|---|
| `ghost.matmul`          | Matrix multiplication (multi-target lowering) |
| `ghost.attention`       | Scaled dot-product attention (Flash-Attention-2 hint) |
| `ghost.embedding`       | Table lookup (hardware vectorised) |
| `ghost.sparse_matmul`   | Sparse GEMM (CSR or 2:4) |
| `ghost.quantize`        | FP16→INT8 with per-channel scales |
| `ghost.dequantize`      | INT8→FP32 accumulator reconstruction |
| `ghost.tile_dispatch`   | Lower to chiplet DMA descriptor |

### Attributes

| Attribute        | Description |
|---|---|
| `governance_nonce` | L1 governance nonce attached to compiled kernel (verifiable) |
| `tile_size`        | Target tile size hint (overrides auto-tiling) |
| `sparsity_ratio`   | 0.0–1.0 weight sparsity for pruning passes |
| `quant_config`     | Quantisation config: bits, zero_point, scale |

---

## Optimization Passes

### 1. Fusion Pass

Fuses adjacent operations that share data in the register file to
eliminate intermediate memory round-trips. Example:

```
Before:  LayerNorm → GELU → Linear
After:   FusedLayerNormGELULinear (single kernel)
```

Fusion decisions use the roofline model: only fuse if the fused op is
memory-bound (arithmetic intensity < ridge point).

### 2. Tiling Pass

Tiles large matrix dimensions to fit within the chiplet's 256 MB on-die
SRAM. Default tile sizes:

| Target  | M tile | N tile | K tile |
|---|---|---|---|
| CPU     | 64     | 64     | 256    |
| GPU     | 128    | 128    | 64     |
| FPGA    | 16     | 8      | 16     |
| Chiplet | 64     | 64     | 256    |

### 3. Quantization Pass

Applies per-channel INT8 quantization with calibration data:

```
scale_i = max(|w_i|) / 127.0
w_q_i   = clamp(round(w_i / scale_i), -127, 127)
```

Produces `ghost.quantize` + `ghost.dequantize` pairs. On chiplet, these
are fused with the tensor core pipeline (zero hardware overhead).

### 4. Sparsity Pass

Applies 2:4 structured pruning to weight tensors. Within each group of 4
consecutive weights, the two smallest-magnitude weights are zeroed and a
2-bit selector mask is stored. The sparse tile hardware decompresses
on-the-fly with no extra cycles.

Sparsity pass requires `sparsity_ratio ≥ 0.5` in the op attribute, and
validates that the resulting kernel is within 5% of the dense baseline
using the performance predictor.

---

## Backends

### CPU Backend

Lowers `ghost.matmul` to OpenBLAS SGEMM / DGEMM calls. Tiling is
managed by the allocator; no custom assembly required.

### GPU Backend (future)

Lowers to cuBLAS GEMM + cuSPARSE for sparse ops. XLA-compatible HLO
emission path planned for TPU backend.

### FPGA Backend

Emits DMA descriptors for the `dma_engine.v` module. Each tile dispatch
maps to a 32-byte DMA descriptor: `{ src_addr, dst_addr, len, crc32c }`.
The FPGA pipeline reads descriptors from the ring buffer and dispatches
to the 16×8×16 systolic array tiles.

### Chiplet Backend

The primary production target. Lowers to the chiplet tile ISA:
- `TILE_LOAD src dst len` — DMA from HBM to SRAM
- `TC_EXEC tile_id A B C` — Tensor core execution
- `TILE_STORE dst src len` — DMA from SRAM to HBM
- `SPARSE_EXEC tile_id` — Sparse operation dispatch
- `SYNC barrier_id` — Cross-tile synchronisation

---

## Compiler Daemon

The compiler exposes a REST daemon on port 7930:

```
POST /v1/compile
Content-Type: application/json

{
  "model_id": "llama-7b",
  "source":   "ghost.ir",   // GhostIR source (MLIR text format)
  "target":   "chiplet",    // cpu | gpu | fpga | chiplet
  "opts": {
    "quantize": true,
    "sparsity": 0.5,
    "opt_level": 2
  }
}

→ 200 { "kernel_cid": "bafyrei...", "stats": { "flops": 14e12, ... } }
```

Compiled kernels are stored in GhostStore (content-addressed) and
referenced by CID. Governance-nonce attachment is performed on the
signing relay, not in the compiler, to maintain key separation.

---

## Formal Verification

The quantization pass and sparsity pass are candidates for formal
verification via the Lean4 proof assistant. The invariant checked:

> ∀ w ∈ W: |dequant(quant(w)) − w| < ε · max(|W|)

where ε = 2^(-7) for INT8 (theoretical bound). The verification harness
is in `compiler/formal/quant_correctness.lean` (WIP).
