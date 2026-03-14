"""
GhostBrain — Attention Kernel Microbenchmark

Benchmarks the core attention operation (QK^T, softmax, AV) in isolation,
comparing naive, Flash-Attention-2 style, and GhostTensor dialect variants.

Usage:
    python attention_kernel.py --seq-len 2048 --heads 32 --dim 128
    python attention_kernel.py --sweep
"""

from __future__ import annotations

import argparse
import math
import time
from dataclasses import dataclass
from typing import List, Tuple


# ── Attention Config ──────────────────────────────────────────────────────────

@dataclass
class AttentionConfig:
    seq_len:    int
    n_heads:    int
    head_dim:   int
    batch_size: int = 1
    causal:     bool = True
    dtype_bytes: int = 2  # FP16

    @property
    def total_tokens(self) -> int:
        return self.seq_len * self.batch_size

    def qkv_bytes(self) -> int:
        return 3 * self.batch_size * self.n_heads * self.seq_len * self.head_dim * self.dtype_bytes

    def output_bytes(self) -> int:
        return self.batch_size * self.n_heads * self.seq_len * self.head_dim * self.dtype_bytes


# ── FLOP Calculators ──────────────────────────────────────────────────────────

def naive_attention_flops(cfg: AttentionConfig) -> int:
    """Full O(N²) attention FLOPs."""
    b, h, s, d = cfg.batch_size, cfg.n_heads, cfg.seq_len, cfg.head_dim
    qkt_flops   = 2 * b * h * s * s * d      # QK^T
    softmax     = b * h * s * s * 5           # max, sub, exp, sum, div
    av_flops    = 2 * b * h * s * s * d      # AV
    return qkt_flops + softmax + av_flops


def flash_attention_flops(cfg: AttentionConfig, block_size: int = 64) -> int:
    """Flash-Attention-2 FLOPs (same FLOP count, better memory access pattern)."""
    # FLOP count is identical to naive; memory access is tile-local
    return naive_attention_flops(cfg)


def flash_attention_bytes(cfg: AttentionConfig, block_size: int = 64) -> int:
    """Flash-Attention-2 HBM bytes: O(N) vs naive O(N²)."""
    b, h, s, d = cfg.batch_size, cfg.n_heads, cfg.seq_len, cfg.head_dim
    n_blocks = math.ceil(s / block_size)
    # Per-block: load Q tile, K tile, V tile; write O tile
    block_qkv = 3 * b * h * block_size * d * cfg.dtype_bytes
    return block_qkv * n_blocks


def naive_attention_bytes(cfg: AttentionConfig) -> int:
    """Naive attention HBM bytes: materialises full N×N score matrix."""
    b, h, s, d = cfg.batch_size, cfg.n_heads, cfg.seq_len, cfg.head_dim
    qkv   = cfg.qkv_bytes()
    score = b * h * s * s * cfg.dtype_bytes   # full score matrix
    out   = cfg.output_bytes()
    return qkv + score + out


# ── Timing Simulator ──────────────────────────────────────────────────────────

@dataclass
class KernelResult:
    variant:        str
    flops:          int
    hbm_bytes:      int
    ai:             float   # arithmetic intensity
    latency_us:     float   # microseconds
    achieved_tops:  float
    bottleneck:     str

    def __str__(self) -> str:
        return (
            f"  {self.variant:<22} | AI={self.ai:6.1f} F/B | "
            f"lat={self.latency_us:8.1f} µs | {self.achieved_tops:6.2f} TOPS | "
            f"[{self.bottleneck}]"
        )


def simulate_kernel(variant: str, flops: int, hbm_bytes: int,
                    peak_tops: float, peak_bw_GBps: float) -> KernelResult:
    ai  = flops / max(hbm_bytes, 1)
    ridge = (peak_tops * 1e12) / (peak_bw_GBps * 1e9)
    if ai < ridge:
        # memory-bound
        achieved_tops = ai * peak_bw_GBps / 1e3
        bottleneck = "memory"
    else:
        achieved_tops = peak_tops * 0.92    # 92% compute efficiency
        bottleneck = "compute"
    latency_s  = flops / (achieved_tops * 1e12)
    latency_us = latency_s * 1e6
    return KernelResult(variant, flops, hbm_bytes, ai, latency_us, achieved_tops, bottleneck)


# ── Benchmark ─────────────────────────────────────────────────────────────────

def run_benchmark(cfg: AttentionConfig,
                  peak_tops: float = 512.0,
                  peak_bw: float   = 3600.0) -> List[KernelResult]:
    results = []

    naive_f  = naive_attention_flops(cfg)
    naive_b  = naive_attention_bytes(cfg)
    flash_f  = flash_attention_flops(cfg)
    flash_b  = flash_attention_bytes(cfg)

    results.append(simulate_kernel("Naive Attention",             naive_f, naive_b, peak_tops, peak_bw))
    results.append(simulate_kernel("Flash-Attention-2 (B=64)",   flash_f, flash_b, peak_tops, peak_bw))
    results.append(simulate_kernel("Flash-Attention-2 (B=128)",  flash_f,
                                   flash_attention_bytes(cfg, block_size=128), peak_tops, peak_bw))
    # GhostTensor dialect applies INT8 quantisation → 2× FLOPs reduction on GEMM
    ghost_f  = naive_f // 2
    ghost_b  = flash_attention_bytes(cfg, block_size=128) // 2  # INT8 = half bytes
    results.append(simulate_kernel("GhostTensor INT8", ghost_f, ghost_b, peak_tops, peak_bw))
    return results


def sweep() -> None:
    configs = [
        AttentionConfig(512,  32, 128),
        AttentionConfig(1024, 32, 128),
        AttentionConfig(2048, 32, 128),
        AttentionConfig(4096, 32, 128),
        AttentionConfig(4096, 8,  128, batch_size=4),
    ]
    print(f"\n  {'─'*80}")
    print(f"  {'Config':<30} {'Variant':<24} {'Lat (µs)':>10} {'TOPS':>8} {'Bound':>10}")
    print(f"  {'─'*80}")
    for cfg in configs:
        label = f"B={cfg.batch_size} N={cfg.seq_len} H={cfg.n_heads} D={cfg.head_dim}"
        for r in run_benchmark(cfg):
            print(f"  {label:<30} {r.variant:<24} "
                  f"{r.latency_us:>10.1f} {r.achieved_tops:>8.2f} {r.bottleneck:>10}")
        label = ""
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Attention Kernel Benchmark")
    parser.add_argument("--seq-len",  type=int, default=2048)
    parser.add_argument("--heads",    type=int, default=32)
    parser.add_argument("--dim",      type=int, default=128)
    parser.add_argument("--batch",    type=int, default=1)
    parser.add_argument("--sweep",    action="store_true")
    args = parser.parse_args()

    if args.sweep:
        sweep()
    else:
        cfg     = AttentionConfig(args.seq_len, args.heads, args.dim, args.batch)
        results = run_benchmark(cfg)
        print(f"\n  Attention kernel benchmark — seq={cfg.seq_len} heads={cfg.n_heads} dim={cfg.head_dim}")
        print(f"  {'─'*75}")
        for r in results:
            print(r)
        print()
