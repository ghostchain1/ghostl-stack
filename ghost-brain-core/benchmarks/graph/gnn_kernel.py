"""
GhostBrain — GNN (Graph Neural Network) Kernel Benchmark

Benchmarks core GNN operations:
  - Sparse neighbour aggregation (message passing)
  - Node feature transformation (dense GEMM)
  - Edge-conditioned attention (GAT)

Usage:
    python gnn_kernel.py --nodes 100000 --avg-degree 50
    python gnn_kernel.py --sweep
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from typing import List


# ── Graph + Feature Config ───────────────────────────────────────────────────

@dataclass
class GraphConfig:
    n_nodes:       int
    avg_degree:    int
    feature_dim:   int
    hidden_dim:    int
    n_layers:      int = 3
    n_heads:       int = 8   # for GAT-style attention
    dtype_bytes:   int = 4   # FP32 (graph training typically full-precision)

    @property
    def n_edges(self) -> int:
        return self.n_nodes * self.avg_degree

    @property
    def adj_bytes(self) -> int:
        """COO adjacency list (2 × INT32 per edge)."""
        return self.n_edges * 2 * 4

    @property
    def feature_bytes(self) -> int:
        return self.n_nodes * self.feature_dim * self.dtype_bytes


# ── Kernel Analysis ───────────────────────────────────────────────────────────

def neighbour_aggregation(cfg: GraphConfig) -> dict:
    """
    SpMM: aggregation of neighbour features.
    A (sparse, N×N) × X (dense, N×D) = Y (dense, N×D)
    """
    nz = cfg.n_edges
    # Bytes: adj (sparse), X features, Y output
    bytes_io = (nz * (4 + 4) +        # (row, col) COO
                cfg.n_nodes * cfg.feature_dim * cfg.dtype_bytes * 2)  # X + Y
    flops = 2 * nz * cfg.feature_dim  # scatter-add per nnz
    return {
        "op":    "NeighbourAggregation (SpMM)",
        "flops": flops,
        "bytes": bytes_io,
        "ai":    flops / bytes_io,
    }


def node_transform(cfg: GraphConfig) -> dict:
    """Dense GEMM: H_in (N×D) × W (D×H) = H_out (N×H)."""
    D, H = cfg.feature_dim, cfg.hidden_dim
    flops    = 2 * cfg.n_nodes * D * H
    bytes_io = (cfg.n_nodes * D * cfg.dtype_bytes +   # input
                D * H * cfg.dtype_bytes +              # weight
                cfg.n_nodes * H * cfg.dtype_bytes)     # output
    return {
        "op":    "NodeTransform (GEMM)",
        "flops": flops,
        "bytes": bytes_io,
        "ai":    flops / bytes_io,
    }


def gat_attention(cfg: GraphConfig) -> dict:
    """
    Graph Attention (GAT): per-edge attention coefficients.
    FLOPs: 2 × n_edges × n_heads × (2 × head_dim) — leaky-relu dot product
    """
    head_dim = cfg.hidden_dim // cfg.n_heads
    flops    = 2 * cfg.n_edges * cfg.n_heads * (2 * head_dim)
    # Edge features: src + dst concat per edge × heads
    bytes_io = cfg.n_edges * cfg.n_heads * 2 * head_dim * cfg.dtype_bytes
    return {
        "op":    "GAT Attention (edge-wise)",
        "flops": flops,
        "bytes": bytes_io,
        "ai":    flops / bytes_io,
    }


# ── Hardware Targets ──────────────────────────────────────────────────────────

@dataclass
class HWSpec:
    name:              str
    peak_tflops_fp32:  float
    hbm_bw_GBps:       float
    random_bw_GBps:    float   # random-access penalty for graph traversal


HW_TARGETS: List[HWSpec] = [
    HWSpec("GhostBrain Chiplet", 256.0,  3600.0, 400.0),
    HWSpec("GPU (H100 SXM5)",    500.0,  3350.0, 250.0),
    HWSpec("CPU (Xeon Platinum)",  2.0,    64.0,  20.0),
]


def latency_ms(op_dict: dict, hw: HWSpec, irregular: bool = False) -> float:
    bw    = hw.random_bw_GBps if irregular else hw.hbm_bw_GBps
    ridge = (hw.peak_tflops_fp32 * 1e12) / (bw * 1e9)
    if op_dict["ai"] < ridge:
        achievable = op_dict["ai"] * bw / 1e3
    else:
        achievable = hw.peak_tflops_fp32 * 0.85
    return (op_dict["flops"] / (achievable * 1e12)) * 1e3


def run_benchmark(cfg: GraphConfig) -> None:
    ops = [
        (neighbour_aggregation(cfg), True),    # irregular memory access → random BW
        (node_transform(cfg),        False),
        (gat_attention(cfg),         True),
    ]
    print(f"\n  GNN Benchmark: N={cfg.n_nodes:,}  deg={cfg.avg_degree}  "
          f"D={cfg.feature_dim}  H={cfg.hidden_dim}  layers={cfg.n_layers}")
    for hw in HW_TARGETS:
        print(f"\n    [{hw.name}]")
        print(f"  {'Operation':<32} {'AI':>6} {'Lat/layer (ms)':>16} {'Total (ms)':>12}")
        print(f"  {'─'*70}")
        for op, irreg in ops:
            lat     = latency_ms(op, hw, irreg)
            total   = lat * cfg.n_layers
            print(f"  {op['op']:<32} {op['ai']:>6.2f} {lat:>16.3f} {total:>12.2f}")


def sweep() -> None:
    configs = [
        GraphConfig(n_nodes=100_000,   avg_degree=20,  feature_dim=128, hidden_dim=256),
        GraphConfig(n_nodes=1_000_000, avg_degree=50,  feature_dim=64,  hidden_dim=128),
        GraphConfig(n_nodes=10_000_000, avg_degree=10, feature_dim=32,  hidden_dim=64),
    ]
    for cfg in configs:
        run_benchmark(cfg)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain GNN Kernel Benchmark")
    parser.add_argument("--nodes",      type=int, default=100_000)
    parser.add_argument("--avg-degree", type=int, default=20)
    parser.add_argument("--feature-dim",type=int, default=128)
    parser.add_argument("--hidden-dim", type=int, default=256)
    parser.add_argument("--layers",     type=int, default=3)
    parser.add_argument("--sweep",      action="store_true")
    args = parser.parse_args()

    if args.sweep:
        sweep()
    else:
        cfg = GraphConfig(
            n_nodes    = args.nodes,
            avg_degree = args.avg_degree,
            feature_dim= args.feature_dim,
            hidden_dim = args.hidden_dim,
            n_layers   = args.layers,
        )
        run_benchmark(cfg)
