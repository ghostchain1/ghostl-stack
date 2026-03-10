"""
GhostBrain — MLPerf Inference Adapter

Adapts GhostBrain kernel benchmarks to produce MLPerf Inference v4.x-compatible
result files for ResNet-50, BERT-Large, and GPT-J workloads.

This is a simulation adapter — results are analytically derived from the
roofline model. Plug in real hardware timings to produce compliant results.

Reference: https://mlcommons.org/benchmarks/inference/
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional


# ── MLPerf Scenarios ──────────────────────────────────────────────────────────

SCENARIOS = ["SingleStream", "Offline", "Server", "MultiStream"]

# MLPerf v4 target QPS / latency targets (approximations)
TARGETS: Dict[str, Dict[str, float]] = {
    "resnet50": {
        "SingleStream_latency_ms": 0.5,
        "Offline_qps":            30_000,
        "Server_target_latency_ms": 15.0,
    },
    "bert-large": {
        "SingleStream_latency_ms": 1.0,
        "Offline_qps":            4_000,
        "Server_target_latency_ms": 130.0,
    },
    "gptj": {
        "SingleStream_latency_ms": 20.0,
        "Offline_qps":            10,
        "Server_target_latency_ms": 2000.0,
    },
}


# ── Hardware Profiles ──────────────────────────────────────────────────────────

@dataclass
class HWProfile:
    name:              str
    peak_tops_int8:    float   # INT8 throughput TOPS
    peak_tops_fp16:    float
    hbm_bw_GBps:      float
    mem_capacity_GB:   float
    compute_eff:       float = 0.88


HW_PROFILES: Dict[str, HWProfile] = {
    "chiplet": HWProfile("GhostBrain Chiplet v1", 2048.0, 512.0, 3600.0, 96.0, 0.92),
    "gpu":     HWProfile("GPU (H100 SXM5)",       3956.0, 989.0, 3350.0, 80.0, 0.88),
    "cpu":     HWProfile("CPU (2× Xeon Platinum)",   16.0,   4.0,  64.0, 512.0, 0.70),
}


# ── Workload Models ───────────────────────────────────────────────────────────

@dataclass
class WorkloadModel:
    name:          str
    flops_per_inf: float   # INT8 FLOPs per inference
    bytes_per_inf: float   # HBM bytes per inference
    tokens_out:    int = 1

    @property
    def ai(self) -> float:
        return self.flops_per_inf / max(self.bytes_per_inf, 1.0)


WORKLOADS: Dict[str, WorkloadModel] = {
    "resnet50": WorkloadModel(
        "ResNet-50", flops_per_inf=8e9, bytes_per_inf=400e6
    ),
    "bert-large": WorkloadModel(
        "BERT-Large (seq=384)", flops_per_inf=280e9, bytes_per_inf=1.2e9
    ),
    "gptj": WorkloadModel(
        "GPT-J 6B (output=128)", flops_per_inf=3.5e12, bytes_per_inf=24e9, tokens_out=128
    ),
}


# ── Result ────────────────────────────────────────────────────────────────────

@dataclass
class MLPerfResult:
    model:              str
    scenario:           str
    hw:                 str
    achieved_latency_ms: float
    achieved_qps:       float
    target_latency_ms:  Optional[float]
    target_qps:         Optional[float]
    pass_fail:          str

    def to_dict(self) -> dict:
        return asdict(self)


# ── Runner ────────────────────────────────────────────────────────────────────

class MLPerfRunner:
    def __init__(self, hw: HWProfile):
        self.hw = hw

    def _infer_latency_ms(self, wl: WorkloadModel) -> float:
        hw    = self.hw
        ridge = (hw.peak_tops_int8 * 1e12) / (hw.hbm_bw_GBps * 1e9)
        if wl.ai < ridge:
            tops = wl.ai * hw.hbm_bw_GBps / 1e3
        else:
            tops = hw.peak_tops_int8 * hw.compute_eff
        return (wl.flops_per_inf / (tops * 1e12)) * 1e3

    def run(self, wl_name: str, scenario: str) -> MLPerfResult:
        wl  = WORKLOADS[wl_name]
        lat = self._infer_latency_ms(wl)

        tgt = TARGETS.get(wl_name, {})
        if scenario == "SingleStream":
            eff_qps   = 1000.0 / lat
            target_l  = tgt.get("SingleStream_latency_ms")
            target_q  = None
            pass_fail = "PASS" if (target_l is None or lat <= target_l) else "FAIL"
        elif scenario == "Offline":
            eff_qps   = (self.hw.peak_tops_int8 * 1e12 * self.hw.compute_eff) / wl.flops_per_inf
            target_q  = tgt.get("Offline_qps")
            target_l  = None
            pass_fail = "PASS" if (target_q is None or eff_qps >= target_q) else "FAIL"
        elif scenario == "Server":
            eff_qps   = 1000.0 / lat * 0.9   # 90% to respect SLA tail
            target_l  = tgt.get("Server_target_latency_ms")
            target_q  = None
            pass_fail = "PASS" if (target_l is None or lat <= target_l) else "FAIL"
        else:  # MultiStream
            eff_qps   = 1000.0 / lat * 8     # 8-stream
            target_l  = tgt.get("SingleStream_latency_ms", 0) * 8
            target_q  = None
            pass_fail = "PASS" if (target_l is None or lat * 8 <= target_l) else "FAIL"

        return MLPerfResult(
            model               = wl.name,
            scenario            = scenario,
            hw                  = self.hw.name,
            achieved_latency_ms = lat,
            achieved_qps        = eff_qps,
            target_latency_ms   = tgt.get(f"{scenario}_latency_ms") or tgt.get(f"{scenario}_target_latency_ms"),
            target_qps          = tgt.get(f"{scenario}_qps"),
            pass_fail           = pass_fail,
        )

    def full_suite(self) -> List[MLPerfResult]:
        results = []
        for wl_name in WORKLOADS:
            for scenario in SCENARIOS:
                results.append(self.run(wl_name, scenario))
        return results


def print_results(results: List[MLPerfResult]) -> None:
    print(f"\n  {'─'*80}")
    print(f"  {'Model':<22} {'Scenario':<14} {'Lat (ms)':>10} {'QPS':>12} {'Result':>8}")
    print(f"  {'─'*80}")
    for r in results:
        print(f"  {r.model:<22} {r.scenario:<14} {r.achieved_latency_ms:>10.2f} "
              f"{r.achieved_qps:>12.1f} {r.pass_fail:>8}")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain MLPerf Adapter")
    parser.add_argument("--hw",       default="chiplet", choices=list(HW_PROFILES))
    parser.add_argument("--model",    default=None, choices=list(WORKLOADS))
    parser.add_argument("--scenario", default=None, choices=SCENARIOS)
    parser.add_argument("--out",      default=None, help="JSON output path")
    args = parser.parse_args()

    hw     = HW_PROFILES[args.hw]
    runner = MLPerfRunner(hw)

    if args.model and args.scenario:
        results = [runner.run(args.model, args.scenario)]
    else:
        results = runner.full_suite()

    print(f"\n  GhostBrain MLPerf Adapter — {hw.name}")
    print_results(results)

    if args.out:
        with open(args.out, "w") as f:
            json.dump([r.to_dict() for r in results], f, indent=2)
        print(f"  Results saved to {args.out}")
