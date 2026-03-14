"""
GhostBrain — Performance Predictor

Given a kernel profile and target hardware, predicts:
  - Attainable TFLOPS (roofline bound)
  - Estimated latency (ms)
  - Effective bandwidth utilisation (%)
  - Throughput under batching

Builds on roofline_model.py kernel profiles and hw targets.
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass
from typing import Dict, List, Optional

from roofline_model import KERNELS, TARGETS, KernelProfile, HWTarget


# ── Prediction Result ─────────────────────────────────────────────────────────

@dataclass
class PredictionResult:
    kernel:              str
    target:              str
    arithmetic_intensity: float     # FLOP/byte
    attainable_tflops:   float
    memory_bound:        bool
    latency_ms:          float
    bw_utilisation_pct:  float
    compute_util_pct:    float
    tokens_per_second:   Optional[float] = None

    def summary(self) -> str:
        lines = [
            f"Kernel        : {self.kernel}",
            f"Target        : {self.target}",
            f"AI (FLOP/B)   : {self.arithmetic_intensity:.2f}",
            f"Attainable    : {self.attainable_tflops:.2f} TFLOPS",
            f"Bound         : {'memory' if self.memory_bound else 'compute'}",
            f"Latency       : {self.latency_ms:.3f} ms",
            f"BW util       : {self.bw_utilisation_pct:.1f} %",
            f"Compute util  : {self.compute_util_pct:.1f} %",
        ]
        if self.tokens_per_second is not None:
            lines.append(f"Tokens/s      : {self.tokens_per_second:.0f}")
        return "\n  ".join(lines)


# ── Predictor ─────────────────────────────────────────────────────────────────

class PerformancePredictor:
    """
    Combines roofline analysis with hardware efficiency factors to produce
    realistic (not ideal) performance predictions.

    Efficiency factors account for:
      - DRAM page miss overhead (memory-bound kernels)
      - Instruction issue overhead (pipeline bubbles for compute-bound)
      - Memory controller saturation at high BW
    """

    # per-target empirical efficiency corrections
    EFFICIENCY: Dict[str, Dict[str, float]] = {
        "cpu":     {"mem_eff": 0.75, "compute_eff": 0.80},
        "gpu":     {"mem_eff": 0.85, "compute_eff": 0.90},
        "fpga":    {"mem_eff": 0.78, "compute_eff": 0.85},
        "chiplet": {"mem_eff": 0.88, "compute_eff": 0.92},
    }

    def predict(self, kernel: KernelProfile, hw: HWTarget,
                batch_size: int = 1,
                tokens_per_call: Optional[int] = None) -> PredictionResult:
        eff    = self.EFFICIENCY.get(hw.name.split()[0].lower(),
                                     {"mem_eff": 0.8, "compute_eff": 0.85})
        ai     = kernel.arithmetic_intensity
        bound  = ai < hw.ridge_point

        if bound:
            # memory-bound: achievable TFLOPS scales with BW * efficiency * AI
            bw_eff       = hw.peak_bw_GBps * eff["mem_eff"]
            tflops       = ai * bw_eff / 1e3
            bw_util      = eff["mem_eff"] * 100.0
            compute_util = (tflops / hw.peak_flops_tflps) * 100.0
        else:
            # compute-bound
            tflops       = hw.peak_flops_tflps * eff["compute_eff"]
            compute_util = eff["compute_eff"] * 100.0
            effective_ai = tflops * 1e3 / hw.peak_bw_GBps  # implied
            bw_util      = min(100.0, (effective_ai / ai) * 100.0)

        total_flops = kernel.flops * batch_size
        latency_s   = total_flops / (tflops * 1e12)
        latency_ms  = latency_s * 1e3

        tps: Optional[float] = None
        if tokens_per_call is not None and latency_ms > 0:
            tps = (tokens_per_call * batch_size) / latency_s

        return PredictionResult(
            kernel               = kernel.name,
            target               = hw.name,
            arithmetic_intensity = ai,
            attainable_tflops    = tflops,
            memory_bound         = bound,
            latency_ms           = latency_ms,
            bw_utilisation_pct   = bw_util,
            compute_util_pct     = compute_util,
            tokens_per_second    = tps,
        )

    def run_all(self, target_name: str = "chiplet") -> List[PredictionResult]:
        hw = TARGETS[target_name]
        return [self.predict(k, hw) for k in KERNELS]

    def batch_scaling(self, kernel: KernelProfile, hw: HWTarget,
                      batch_sizes: List[int]) -> None:
        """Print a table showing how latency scales with batch size."""
        print(f"\n  Batch scaling — {kernel.name} on {hw.name}")
        print(f"  {'Batch':>6} {'Latency (ms)':>14} {'TFLOPS':>10} {'Bound':>10}")
        print(f"  {'─'*6:─>6} {'─'*14:─>14} {'─'*10:─>10} {'─'*10:─>10}")
        for bs in batch_sizes:
            r = self.predict(kernel, hw, batch_size=bs)
            print(f"  {bs:>6} {r.latency_ms:>14.3f} {r.attainable_tflops:>10.2f} "
                  f"{'mem' if r.memory_bound else 'compute':>10}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def _find_kernel(name: str) -> Optional[KernelProfile]:
    for k in KERNELS:
        if k.name == name:
            return k
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Performance Predictor")
    parser.add_argument("--target",  default="chiplet", choices=list(TARGETS))
    parser.add_argument("--kernel",  default=None)
    parser.add_argument("--batch",   type=int, default=1)
    parser.add_argument("--tokens",  type=int, default=None,
                        help="Tokens per inference call (for tokens/sec reporting)")
    parser.add_argument("--scaling", action="store_true",
                        help="Print batch-size scaling table")
    args = parser.parse_args()

    predictor = PerformancePredictor()
    hw        = TARGETS[args.target]

    if args.kernel:
        k = _find_kernel(args.kernel)
        if k is None:
            print(f"Unknown kernel '{args.kernel}'. Options: {[k.name for k in KERNELS]}")
            raise SystemExit(1)
        r = predictor.predict(k, hw, batch_size=args.batch, tokens_per_call=args.tokens)
        print(f"\n  {r.summary()}\n")
        if args.scaling:
            predictor.batch_scaling(k, hw, [1, 2, 4, 8, 16, 32])
    else:
        print(f"\n  GhostBrain Performance Predictions — {hw.name}\n")
        for r in predictor.run_all(args.target):
            print(f"  {'─'*50}")
            print(f"  {r.summary()}")
        print()
