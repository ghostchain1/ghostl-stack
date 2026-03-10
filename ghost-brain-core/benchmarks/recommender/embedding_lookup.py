"""
GhostBrain — Embedding Lookup Benchmark

Benchmarks embedding table lookup patterns common to recommendation systems:
  - Dense lookup (all indices present in one table)
  - Sparse lookup (irregular scatter/gather across many tables)
  - Pooled embedding (multi-hot with sum/mean reduction)

Usage:
    python embedding_lookup.py --vocab 128000 --dim 128 --batch 1024
    python embedding_lookup.py --sweep
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from typing import List


# ── Config ────────────────────────────────────────────────────────────────────

@dataclass
class EmbeddingConfig:
    vocab_size:     int
    embedding_dim:  int
    batch_size:     int         # number of lookup requests
    lookups_per_req: int = 1    # for multi-hot (pooled embedding)
    n_tables:       int = 1     # number of embedding tables (rec system)
    dtype_bytes:    int = 2     # FP16

    @property
    def table_size_MB(self) -> float:
        return self.vocab_size * self.embedding_dim * self.dtype_bytes / (1024 ** 2)

    @property
    def total_table_MB(self) -> float:
        return self.table_size_MB * self.n_tables


# ── FLOP / Byte Analysis ──────────────────────────────────────────────────────

def lookup_analysis(cfg: EmbeddingConfig) -> dict:
    """Returns FLOPs, HBM bytes, and arithmetic intensity for embedding lookup."""
    total_lookups = cfg.batch_size * cfg.lookups_per_req * cfg.n_tables
    
    # Embedding lookup: one gather per index, no multiply-accumulate
    # AI ≈ 0 for pure gather — model as 1 FLOP per element loaded
    bytes_read    = total_lookups * cfg.embedding_dim * cfg.dtype_bytes
    flops         = total_lookups * cfg.embedding_dim  # "1 FLOP/elem" convention
    
    # Pooling reduction (if multi-hot)
    if cfg.lookups_per_req > 1:
        pool_flops = cfg.batch_size * cfg.n_tables * cfg.embedding_dim * cfg.lookups_per_req
        flops     += pool_flops

    return {
        "total_lookups": total_lookups,
        "bytes_read_MB": bytes_read / (1024 ** 2),
        "flops":         flops,
        "ai":            flops / max(bytes_read, 1),
    }


# ── Hardware Latency Estimator ────────────────────────────────────────────────

@dataclass
class HWSpec:
    name:         str
    hbm_bw_GBps:  float   # streaming bandwidth
    rand_bw_GBps: float   # small-random-access bandwidth (4K pages)
    cache_MB:     float   # on-chip SRAM


def lookup_latency(cfg: EmbeddingConfig, hw: HWSpec) -> dict:
    analysis = lookup_analysis(cfg)

    # Determine if table fits in SRAM cache
    if cfg.total_table_MB <= hw.cache_MB:
        # Hot-cache path: use SRAM bandwidth (proxy = 10× HBM)
        eff_bw = hw.hbm_bw_GBps * 10.0
        access_mode = "sram-cached"
    elif cfg.table_size_MB <= 2048:
        # Random access into HBM (worst-case)
        eff_bw = hw.rand_bw_GBps
        access_mode = "hbm-random"
    else:
        # Table too large even for HBM — must spill to host DRAM (NVLink/PCIe)
        eff_bw = 64.0   # PCIe gen5 ×16 ≈ 64 GB/s
        access_mode = "host-dram-spill"

    bytes_read = analysis["bytes_read_MB"] * (1024 ** 2)
    latency_ms = (bytes_read / (eff_bw * 1e9)) * 1e3

    return {
        "hw":         hw.name,
        "mode":       access_mode,
        "latency_ms": latency_ms,
        "bw_use_GBps": (bytes_read / (1024 ** 3)) / (latency_ms / 1000.0),
        **analysis,
    }


HW_TARGETS = [
    HWSpec("GhostBrain Chiplet", hbm_bw_GBps=3600.0, rand_bw_GBps=320.0, cache_MB=256.0),
    HWSpec("GPU (H100 SXM5)",    hbm_bw_GBps=3350.0, rand_bw_GBps=200.0, cache_MB=50.0),
    HWSpec("CPU (Xeon Platinum)", hbm_bw_GBps=64.0,   rand_bw_GBps=28.0,  cache_MB=60.0),
]


def print_row(r: dict) -> None:
    print(f"  {r['hw']:<26} {r['mode']:<18} {r['latency_ms']:>10.3f} ms  "
          f"{r['bytes_read_MB']:>8.1f} MB  AI={r['ai']:.3f}")


def sweep() -> None:
    configs = [
        EmbeddingConfig(128_000,  128,  1024, lookups_per_req=1,  n_tables=1),
        EmbeddingConfig(128_000,  128,  1024, lookups_per_req=50, n_tables=64),  # rec sys
        EmbeddingConfig(10_000_000, 64, 256,  lookups_per_req=1,  n_tables=1),    # large vocab
    ]
    for cfg in configs:
        print(f"\n  Vocab={cfg.vocab_size:>10,}  dim={cfg.embedding_dim}  "
              f"bs={cfg.batch_size}  k={cfg.lookups_per_req}  tables={cfg.n_tables}  "
              f"table_size={cfg.total_table_MB:.0f} MB")
        print(f"  {'Hardware':<26} {'Mode':<18} {'Latency':>12} {'Bytes':>10}")
        print(f"  {'─'*70}")
        for hw in HW_TARGETS:
            r = lookup_latency(cfg, hw)
            print_row(r)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Embedding Lookup Benchmark")
    parser.add_argument("--vocab",   type=int, default=128_000)
    parser.add_argument("--dim",     type=int, default=128)
    parser.add_argument("--batch",   type=int, default=1024)
    parser.add_argument("--tables",  type=int, default=1)
    parser.add_argument("--k",       type=int, default=1, help="lookups per request (multi-hot)")
    parser.add_argument("--sweep",   action="store_true")
    args = parser.parse_args()

    if args.sweep:
        sweep()
    else:
        cfg = EmbeddingConfig(args.vocab, args.dim, args.batch,
                              lookups_per_req=args.k, n_tables=args.tables)
        print(f"\n  Table size: {cfg.total_table_MB:.1f} MB  ({cfg.n_tables} table(s))")
        print(f"  {'Hardware':<26} {'Mode':<18} {'Latency':>12} {'Bytes':>10}")
        print(f"  {'─'*70}")
        for hw in HW_TARGETS:
            r = lookup_latency(cfg, hw)
            print_row(r)
        print()
