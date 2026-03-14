"""
GhostBrain — Graph Traversal Benchmark

Benchmarks BFS/DFS/random-walk graph traversal patterns used in:
  - Knowledge graph inference
  - Fraud graph analytics
  - GhostChain transaction graph anomaly detection

Usage:
    python graph_traversal.py --nodes 1000000 --edges 10000000 --algo bfs
    python graph_traversal.py --sweep
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from typing import List, Dict


# ── Graph Config ──────────────────────────────────────────────────────────────

@dataclass
class TraversalConfig:
    n_nodes:     int
    n_edges:     int
    algo:        str      # bfs | dfs | random_walk
    frontier_pct: float = 0.01  # initial frontier as % of nodes
    walk_length:  int  = 80     # steps per random walk
    n_walks:      int  = 1000   # number of random walks

    @property
    def avg_degree(self) -> float:
        return self.n_edges / max(self.n_nodes, 1)

    @property
    def adj_bytes(self) -> int:
        """CSR adjacency list: col_ind (INT32) + row_ptr (INT32)."""
        return self.n_edges * 4 + (self.n_nodes + 1) * 4

    @property
    def node_data_bytes(self) -> int:
        """Per-node metadata: visited flag + distance (8 bytes per node)."""
        return self.n_nodes * 8


# ── Traversal Analysis ────────────────────────────────────────────────────────

def bfs_analysis(cfg: TraversalConfig) -> dict:
    """
    BFS over sparse graph.
    - Random reads into adj list (low locality)
    - Frontier-parallel edge processing
    """
    frontier   = max(1, int(cfg.n_nodes * cfg.frontier_pct))
    # Worst-case: traverse all edges once
    edge_reads = cfg.n_edges * 4          # col_ind random reads (INT32)
    node_rw    = cfg.n_nodes * 8 * 2      # read + write visited + dist
    total_bytes = edge_reads + node_rw
    # ~1 op per edge check (compare + branch)
    flops       = cfg.n_edges + cfg.n_nodes
    return {
        "algo":  "BFS",
        "flops": flops,
        "bytes": total_bytes,
        "ai":    flops / total_bytes,
        "random_access": True,
    }


def dfs_analysis(cfg: TraversalConfig) -> dict:
    """
    DFS: worse cache behaviour than BFS (deep-first order = random jumps).
    Model with 2× random-access penalty.
    """
    a = bfs_analysis(cfg)
    return {**a, "algo": "DFS", "bytes": a["bytes"] * 2, "ai": a["ai"] / 2}


def random_walk_analysis(cfg: TraversalConfig) -> dict:
    """
    Random walk: n_walks × walk_length steps.
    Each step: one random neighbour access.
    """
    total_steps  = cfg.n_walks * cfg.walk_length
    # Each step: read row_ptr[u], random col_ind[r] pick → 2 random INT32 reads
    bytes_per_st = 2 * 4 + 4 * 4        # row_ptr read + 4 candidate col reads
    total_bytes  = total_steps * bytes_per_st
    flops        = total_steps * 8       # index math + random selection
    return {
        "algo":  "RandomWalk",
        "flops": flops,
        "bytes": total_bytes,
        "ai":    flops / total_bytes,
        "random_access": True,
    }


# ── Hardware Estimate ─────────────────────────────────────────────────────────

@dataclass
class HWSpec:
    name:            str
    hbm_bw_GBps:     float
    random_bw_GBps:  float   # 4KB random-access effective BW
    gddr_bw_GBps:    float = 0.0   # host DRAM (for graph too large for HBM)
    hbm_capacity_GB: float = 96.0


def latency_ms(analysis: dict, cfg: TraversalConfig, hw: HWSpec) -> float:
    # Check if full graph fits in HBM
    total_graph_GB = (cfg.adj_bytes + cfg.node_data_bytes) / 1e9
    if total_graph_GB > hw.hbm_capacity_GB and hw.gddr_bw_GBps > 0:
        bw = hw.gddr_bw_GBps
    elif analysis.get("random_access"):
        bw = hw.random_bw_GBps
    else:
        bw = hw.hbm_bw_GBps
    return (analysis["bytes"] / (bw * 1e9)) * 1e3


HW_TARGETS: List[HWSpec] = [
    HWSpec("GhostBrain Chiplet", 3600.0, 400.0, 64.0,  96.0),
    HWSpec("GPU (H100 SXM5)",   3350.0, 200.0, 64.0,  80.0),
    HWSpec("CPU (Xeon Platinum)",  64.0,  20.0, 64.0, 512.0),
]


def run_benchmark(cfg: TraversalConfig) -> None:
    analyses: Dict[str, dict] = {
        "bfs":         bfs_analysis(cfg),
        "dfs":         dfs_analysis(cfg),
        "random_walk": random_walk_analysis(cfg),
    }
    graph_GB = (cfg.adj_bytes + cfg.node_data_bytes) / 1e9
    print(f"\n  Graph: N={cfg.n_nodes:,}  E={cfg.n_edges:,}  deg={cfg.avg_degree:.1f}  size={graph_GB:.2f} GB")
    
    algos = [analyses.get(cfg.algo)] if cfg.algo != "all" else list(analyses.values())
    if not algos or algos[0] is None:
        algos = list(analyses.values())

    for hw in HW_TARGETS:
        print(f"\n    [{hw.name}]")
        print(f"  {'Algorithm':<16} {'AI':>6} {'Latency (ms)':>14} {'GB/s':>8}")
        print(f"  {'─'*50}")
        for a in algos:
            lat = latency_ms(a, cfg, hw)
            bw  = (a["bytes"] / 1e9) / (lat / 1e3) if lat > 0 else 0
            print(f"  {a['algo']:<16} {a['ai']:>6.4f} {lat:>14.1f} {bw:>8.1f}")


def sweep() -> None:
    configs = [
        TraversalConfig(1_000_000,    10_000_000, "all"),
        TraversalConfig(100_000_000, 500_000_000, "all"),  # large-scale graph
    ]
    for cfg in configs:
        run_benchmark(cfg)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Graph Traversal Benchmark")
    parser.add_argument("--nodes",  type=int, default=1_000_000)
    parser.add_argument("--edges",  type=int, default=10_000_000)
    parser.add_argument("--algo",   default="all", choices=["bfs", "dfs", "random_walk", "all"])
    parser.add_argument("--sweep",  action="store_true")
    args = parser.parse_args()

    if args.sweep:
        sweep()
    else:
        cfg = TraversalConfig(args.nodes, args.edges, args.algo)
        run_benchmark(cfg)
