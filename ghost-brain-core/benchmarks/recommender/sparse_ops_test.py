"""
GhostBrain — Sparse Ops Benchmark

Benchmarks sparse matrix operations relevant to recommendation systems:
  - SpMM (Sparse Matrix × Dense Matrix) in CSR and 2:4 structured formats
  - SpMV (Sparse Matrix × Dense Vector)
  - Sparse embedding table scatter/gather

Usage:
    python sparse_ops_test.py --sparsity 0.9 --m 4096 --k 4096 --n 512
    python sparse_ops_test.py --sweep
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from typing import List, Tuple


# ── Helpers ───────────────────────────────────────────────────────────────────

def nnz(sparsity: float, rows: int, cols: int) -> int:
    """Number of non-zero elements at given density (1-sparsity)."""
    return max(1, int(rows * cols * (1.0 - sparsity)))


@dataclass
class SpMMConfig:
    m: int              # output rows
    k: int              # shared dimension
    n: int              # output cols
    sparsity: float     # fraction of zeros in the sparse matrix A
    dtype_bytes: int = 2  # FP16


# ── Dense Baseline ────────────────────────────────────────────────────────────

def dense_gemm_analysis(cfg: SpMMConfig) -> dict:
    flops = 2 * cfg.m * cfg.k * cfg.n
    bytes_read = (cfg.m * cfg.k + cfg.k * cfg.n + cfg.m * cfg.n) * cfg.dtype_bytes
    return {"variant": "dense-GEMM", "flops": flops, "bytes": bytes_read,
            "ai": flops / bytes_read, "eff_flops": flops}


# ── CSR SpMM ─────────────────────────────────────────────────────────────────

def csr_spmm_analysis(cfg: SpMMConfig) -> dict:
    """CSR-format SpMM: values + col_ind + row_ptr."""
    nz = nnz(cfg.sparsity, cfg.m, cfg.k)
    # Data bytes: values (FP16) + col_idx (INT32)
    a_bytes    = nz * (cfg.dtype_bytes + 4) + (cfg.m + 1) * 4
    b_bytes    = cfg.k * cfg.n * cfg.dtype_bytes
    c_bytes    = cfg.m * cfg.n * cfg.dtype_bytes
    total_bytes = a_bytes + b_bytes + c_bytes
    # FLOPs: 2 per nnz element × n output cols
    flops       = 2 * nz * cfg.n
    return {"variant": "CSR-SpMM", "flops": flops, "bytes": total_bytes,
            "ai": flops / total_bytes, "eff_flops": flops, "nnz": nz}


# ── 2:4 Structured Sparsity ───────────────────────────────────────────────────

def structured_24_analysis(cfg: SpMMConfig) -> dict:
    """
    NVIDIA / GhostBrain 2:4 structured sparsity.
    Exactly 2 non-zeros per group of 4 consecutive k-values.
    Metadata overhead: 2 bits per element in original matrix.
    """
    nz = cfg.m * cfg.k // 2   # exactly 50% non-zero
    # Compressed weights: each FP16 value + 32-bit metadata per 16-group
    val_bytes  = nz * cfg.dtype_bytes
    meta_bytes = (cfg.m * cfg.k // 16) * 4  # 4B per 16-element group
    a_bytes    = val_bytes + meta_bytes
    b_bytes    = cfg.k * cfg.n * cfg.dtype_bytes
    c_bytes    = cfg.m * cfg.n * cfg.dtype_bytes
    total_bytes = a_bytes + b_bytes + c_bytes
    flops       = 2 * nz * cfg.n
    return {"variant": "2:4-Structured", "flops": flops, "bytes": total_bytes,
            "ai": flops / total_bytes, "eff_flops": flops, "nnz": nz}


# ── Hardware Latency ──────────────────────────────────────────────────────────

@dataclass
class HWSpec:
    name:            str
    peak_tflops_fp16: float
    peak_sparse_tflops: float  # hardware sparse unit TFLOPS (2:4)
    hbm_bw_GBps:     float


HW_TARGETS: List[HWSpec] = [
    HWSpec("GhostBrain Chiplet", 512.0, 1024.0, 3600.0),
    HWSpec("GPU (H100 SXM5)",   989.0, 1978.0, 3350.0),
    HWSpec("CPU (Xeon Platinum)",  4.0,    4.0,   64.0),
]


def estimate_latency(analysis: dict, hw: HWSpec, is_structured: bool = False) -> float:
    peak = hw.peak_sparse_tflops if is_structured else hw.peak_tflops_fp16
    ridge = (peak * 1e12) / (hw.hbm_bw_GBps * 1e9)
    if analysis["ai"] < ridge:
        achievable = analysis["ai"] * hw.hbm_bw_GBps / 1e3  # TFLOPS
    else:
        achievable = peak * 0.90
    return (analysis["flops"] / (achievable * 1e12)) * 1e3   # ms


def print_table(configs: List[SpMMConfig]) -> None:
    hdr = f"  {'Variant':<20} {'AI':>6} {'Latency (ms)':>14} {'Speedup':>9}"
    for cfg in configs:
        print(f"\n  Sparsity={cfg.sparsity:.0%}  M={cfg.m}  K={cfg.k}  N={cfg.n}")
        analyses = [
            (dense_gemm_analysis(cfg),      False),
            (csr_spmm_analysis(cfg),        False),
            (structured_24_analysis(cfg),   True),
        ]
        for hw in HW_TARGETS:
            print(f"\n    [{hw.name}]")
            print(hdr)
            print(f"  {'─'*55}")
            baseline_lat = None
            for a, is_s in analyses:
                lat = estimate_latency(a, hw, is_s)
                if baseline_lat is None:
                    baseline_lat = lat
                speedup = baseline_lat / lat if lat > 0 else 1.0
                print(f"  {a['variant']:<20} {a['ai']:>6.2f} {lat:>14.3f} {speedup:>9.2f}×")


def sweep() -> None:
    configs = [
        SpMMConfig(4096, 4096, 512,  sparsity=0.50),
        SpMMConfig(4096, 4096, 512,  sparsity=0.75),
        SpMMConfig(4096, 4096, 512,  sparsity=0.90),
        SpMMConfig(8192, 8192, 1024, sparsity=0.50),
    ]
    print_table(configs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Sparse Ops Benchmark")
    parser.add_argument("--m",        type=int,   default=4096)
    parser.add_argument("--k",        type=int,   default=4096)
    parser.add_argument("--n",        type=int,   default=512)
    parser.add_argument("--sparsity", type=float, default=0.5)
    parser.add_argument("--sweep",    action="store_true")
    args = parser.parse_args()

    if args.sweep:
        sweep()
    else:
        cfg = SpMMConfig(args.m, args.k, args.n, args.sparsity)
        print_table([cfg])
