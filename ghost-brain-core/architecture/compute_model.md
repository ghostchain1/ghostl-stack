# GhostBrain — Compute Model

## Philosophy

GhostBrain uses a **staged compute model** that begins on commodity CPU hardware and scales
progressively to custom silicon without requiring code rewrites.  Each stage is a strict superset
of the previous: software written for Phase 1 (CPU) runs unchanged under Phase 2–5 via the
abstract runtime API.

## Execution Stages

### Phase 1 — CPU (Immediate)
- NumPy-compatible tensor ops via WebAssembly (JS layer) or native C++ kernel library
- SIMD vectorisation (AVX-512 where available) via compiler auto-vectorisation
- Inference engine: ONNX Runtime (CPU EP)
- Concurrency: Node.js worker threads + SharedArrayBuffer for tensor sharing
- Latency target: < 50 ms p99 for 7B parameter compressed model @ batch=1

### Phase 2 — GPU
- CUDA 12 kernels dispatched through ghost_codegen.cpp backend
- Flash-Attention-2 for transformer attention (memory-efficient)
- FP16 / BF16 mixed precision
- Latency target: < 5 ms p99 for 7B @ batch=1

### Phase 3 — FPGA Tensor Tile
- RTL described in `hardware/fpga/tensor_tile.v`
- INT8 weight quantisation (4-bit optional via quantization_pass.cpp)
- 512 MACs/cycle per tile, 8 tiles per FPGA device
- OpenCL host driver for portability
- Latency target: < 2 ms p99

### Phase 4 — Custom Chiplet
- 7 nm compute die, HBM3 memory stack, PCIe Gen5 host interface
- 128 tensor cores, 4 sparse cores, mesh NoC
- On-chip memory encryption (AES-256-XTS)
- Latency target: < 0.5 ms p99

### Phase 5 — AI Cluster Rack
- 8–16 chiplets per node, 512 Gbps all-to-all fabric (RoCEv2)
- GhostBrain distributed scheduler with topology-aware AllReduce
- Fault-tolerant: checkpoint/restore at tensor granularity
- Throughput target: > 1 000 TFLOPS FP16 per rack

## Kernel Execution Model

```
submitKernel(KernelSpec) → priority_queue
                         → batch_optimizer groups compatible kernels
                         → kernel_scheduler dispatches to execution backend
                         → kernel_executor runs on (CPU | GPU | FPGA | chiplet)
                         → tensor_allocator reclaims output buffers
```

All tensor operations are expressed in the **GhostTensor dialect** (MLIR) and lowered by the
compiler to the target backend.  The runtime presents a unified `executeOp(op, inputs, outputs)`
interface regardless of backend.

## Data Types Supported

| Type   | Phase | Notes |
|--------|-------|-------|
| FP32   | 1–5   | Full precision, CPU default |
| FP16   | 2–5   | GPU/chiplet half precision |
| BF16   | 2–5   | Better numerical stability |
| INT8   | 3–5   | Quantised inference |
| INT4   | 4–5   | Ultra-compressed weights |

## Memory Hierarchy

See `memory_model.md` for full detail.  Summary:

| Level     | Capacity   | Bandwidth      | Latency |
|-----------|------------|----------------|---------|
| Registers | 256 KB     | ∞ (on-core)    | 1 cy    |
| L1 SRAM   | 4 MB/core  | 2 TB/s         | 2 cy    |
| L2 SRAM   | 64 MB      | 800 GB/s       | 8 cy    |
| HBM3      | 96 GB      | 3.6 TB/s       | 100 cy  |
| Host DRAM | 512 GB     | 64 GB/s (PCIe) | 1 µs    |

## Scheduling Policy

- **Priority**: governance evaluations > fraud detection > validator health > inference requests > benchmarks
- Preemption: long-running benchmarks yield to governance events (< 5 ms interrupt latency)
- Batching: batch_optimizer combines requests with compatible shapes up to max-batch=64
