"""
GhostBrain — Roofline Performance Model

Plots an arithmetic-intensity vs. achievable-performance roofline for each
GhostBrain execution target and overlays a set of kernels to identify whether
they are memory-bound or compute-bound.

Usage:
    python roofline_model.py --target chiplet --kernel matmul_7b
    python roofline_model.py --plot --output roofline.png
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ── Hardware Rooflines ────────────────────────────────────────────────────────

@dataclass
class HWTarget:
    name:               str
    peak_flops_tflps:   float   # TFLOPS (FP16 peak)
    peak_bw_GBps:       float   # Memory bandwidth GB/s
    cache_bw_GBps:      float   # On-chip SRAM bandwidth GB/s

    @property
    def ridge_point(self) -> float:
        """Arithmetic intensity at which compute and memory limits cross (FLOP/byte)."""
        return (self.peak_flops_tflps * 1e12) / (self.peak_bw_GBps * 1e9)


TARGETS: Dict[str, HWTarget] = {
    "cpu":     HWTarget("CPU (Xeon Platinum)",  4.0,     64.0,   500.0),
    "gpu":     HWTarget("GPU (H100 SXM5)",    989.0,   3350.0,  9800.0),
    "fpga":    HWTarget("FPGA (Alveo U280)",   10.0,    460.0,  2500.0),
    "chiplet": HWTarget("GhostBrain Chiplet", 512.0,  3600.0, 12000.0),
}


# ── Kernel Profiles ───────────────────────────────────────────────────────────

@dataclass
class KernelProfile:
    name:           str
    flops:          float   # total FLOPs
    bytes_accessed: float   # total bytes of HBM traffic
    description:    str = ""

    @property
    def arithmetic_intensity(self) -> float:
        """FLOP/byte ratio."""
        return self.flops / max(self.bytes_accessed, 1.0)

    def achievable_performance(self, hw: HWTarget) -> float:
        """Achievable TFLOPS on the given hw target."""
        compute_limit = hw.peak_flops_tflps
        memory_limit  = (self.arithmetic_intensity * hw.peak_bw_GBps) / 1e3  # → TFLOPS
        return min(compute_limit, memory_limit)

    def is_memory_bound(self, hw: HWTarget) -> bool:
        return self.arithmetic_intensity < hw.ridge_point


KERNELS: List[KernelProfile] = [
    KernelProfile(
        "matmul_7b",
        flops         = 2 * 4096 * 4096 * 4096,  # square GEMM proxy for 7B weight
        bytes_accessed= 4096 * 4096 * 2 * 2,     # A + B, FP16
        description   = "7B parameter GEMM (FP16)",
    ),
    KernelProfile(
        "attention_flash",
        flops         = 2 * 512 * 512 * 128 * 32,  # QK^T + softmax + AV for 32 heads
        bytes_accessed= 512 * 128 * 32 * 3 * 2,    # Q+K+V, FP16
        description   = "Flash-Attention-2 (seq=512, heads=32, dim=128)",
    ),
    KernelProfile(
        "embedding_lookup",
        flops         = 128_000 * 128,              # scatter, ~1 FLOP/element
        bytes_accessed= 128_000 * 128 * 2,          # full embedding table, FP16
        description   = "Embedding lookup (vocab=128k, dim=128)",
    ),
    KernelProfile(
        "sparse_2_4",
        flops         = 2 * 4096 * 4096 * 4096 * 0.5,  # 2:4 → 50% fewer MACs
        bytes_accessed= 4096 * 4096 * 1.0,              # INT8 compressed weights
        description   = "2:4 Sparse GEMM (INT8)",
    ),
]


# ── Roofline Report ───────────────────────────────────────────────────────────

def roofline_report(target_name: str = "chiplet") -> None:
    hw = TARGETS.get(target_name)
    if hw is None:
        print(f"Unknown target '{target_name}'. Options: {list(TARGETS)}")
        return

    print(f"\n{'─'*70}")
    print(f"  GhostBrain Roofline Model — {hw.name}")
    print(f"  Peak compute : {hw.peak_flops_tflps:.1f} TFLOPS (FP16)")
    print(f"  Peak BW      : {hw.peak_bw_GBps:.0f} GB/s (HBM)")
    print(f"  Ridge point  : {hw.ridge_point:.1f} FLOP/byte")
    print(f"{'─'*70}")
    print(f"  {'Kernel':<24} {'AI (F/B)':>10} {'Achievable':>12} {'Bound':>10}")
    print(f"  {''):{'─'<24} {'':─>10} {'':─>12} {'':─>10}")
    for k in KERNELS:
        ai     = k.arithmetic_intensity
        perf   = k.achievable_performance(hw)
        bound  = "memory" if k.is_memory_bound(hw) else "compute"
        print(f"  {k.name:<24} {ai:>10.1f} {perf:>11.2f}T {bound:>10}")
    print(f"{'─'*70}\n")


# ── Optional Matplotlib Plot ──────────────────────────────────────────────────

def plot_roofline(target_name: str = "chiplet", output: Optional[str] = None) -> None:
    try:
        import matplotlib.pyplot as plt  # type: ignore
        import numpy as np               # type: ignore
    except ImportError:
        print("matplotlib / numpy not installed — skipping plot (report still printed above)")
        return

    hw   = TARGETS[target_name]
    ai_x = np.logspace(-2, 4, 500)

    compute_roof = np.full_like(ai_x, hw.peak_flops_tflps)
    memory_roof  = ai_x * hw.peak_bw_GBps / 1e3  # TFLOPS
    roof         = np.minimum(compute_roof, memory_roof)

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.loglog(ai_x, roof, "k-", linewidth=2, label="Roofline")
    ax.axvline(hw.ridge_point, color="grey", linestyle="--", alpha=0.5, label=f"Ridge {hw.ridge_point:.0f} F/B")

    colors = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12"]
    for k, color in zip(KERNELS, colors):
        ai   = k.arithmetic_intensity
        perf = k.achievable_performance(hw)
        ax.scatter([ai], [perf], s=120, color=color, zorder=5, label=k.name)
        ax.annotate(k.name, (ai, perf), textcoords="offset points", xytext=(5, 5), fontsize=8)

    ax.set_xlabel("Arithmetic Intensity (FLOP/byte)")
    ax.set_ylabel("Performance (TFLOPS)")
    ax.set_title(f"GhostBrain Roofline — {hw.name}")
    ax.legend(fontsize=8)
    ax.grid(True, which="both", alpha=0.3)

    if output:
        plt.savefig(output, dpi=150, bbox_inches="tight")
        print(f"Roofline plot saved to {output}")
    else:
        plt.show()


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Roofline Model")
    parser.add_argument("--target", default="chiplet", choices=list(TARGETS))
    parser.add_argument("--plot",   action="store_true")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    roofline_report(args.target)
    if args.plot:
        plot_roofline(args.target, args.output)
