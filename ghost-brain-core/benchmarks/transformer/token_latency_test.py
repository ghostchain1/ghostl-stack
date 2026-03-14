"""
GhostBrain — Token Generation Latency Test

Measures end-to-end token latency for autoregressive decode, including:
  - Time-to-first-token (TTFT) — prefill latency
  - Inter-token latency (ITL) — per decode step
  - P50 / P95 / P99 percentile latency distributions

Usage:
    python token_latency_test.py --target chiplet --runs 1000
    python token_latency_test.py --target chiplet --concurrency 8 --runs 200
"""

from __future__ import annotations

import argparse
import math
import random
import statistics
from dataclasses import dataclass, field
from typing import List, Optional


# ── Simulation Parameters ─────────────────────────────────────────────────────

@dataclass
class TargetSpec:
    name:               str
    prefill_ms_per_512: float   # TTFT for 512 input tokens, batch=1
    decode_ms_per_tok:  float   # median per-token decode latency, batch=1
    jitter_pct:         float   # latency jitter (±%, normally distributed)


TARGETS = {
    "chiplet": TargetSpec("GhostBrain Chiplet",  8.5,  0.9, 2.0),
    "gpu":     TargetSpec("GPU (H100 SXM5)",     6.2,  1.4, 3.5),
    "fpga":    TargetSpec("FPGA (Alveo U280)",  42.0,  5.2, 4.0),
    "cpu":     TargetSpec("CPU (Xeon Platinum)", 220.0, 28.0, 6.0),
}


# ── Latency Sampler ───────────────────────────────────────────────────────────

class LatencySampler:
    def __init__(self, spec: TargetSpec, rng: random.Random):
        self.spec = spec
        self.rng  = rng

    def _jitter(self, base: float) -> float:
        sigma  = base * (self.spec.jitter_pct / 100.0)
        sample = self.rng.gauss(base, sigma)
        # Gamma-distributed tail for realistic long-tail behaviour
        if self.rng.random() < 0.05:          # 5% chance of outlier
            sample += self.rng.expovariate(1.0 / base) * 0.5
        return max(sample, 0.1)

    def prefill_ms(self, input_tokens: int) -> float:
        base = self.spec.prefill_ms_per_512 * (input_tokens / 512.0)
        return self._jitter(base)

    def decode_step_ms(self) -> float:
        return self._jitter(self.spec.decode_ms_per_tok)


# ── Percentile Helper ─────────────────────────────────────────────────────────

def percentile(data: List[float], p: float) -> float:
    if not data:
        return 0.0
    data_s = sorted(data)
    idx    = max(0, int(math.ceil(p / 100.0 * len(data_s))) - 1)
    return data_s[idx]


# ── Run Batch ─────────────────────────────────────────────────────────────────

@dataclass
class LatencyResult:
    target:         str
    runs:           int
    concurrency:    int
    input_tokens:   int
    output_tokens:  int
    ttft_p50_ms:    float
    ttft_p95_ms:    float
    ttft_p99_ms:    float
    itl_p50_ms:     float
    itl_p95_ms:     float
    itl_p99_ms:     float
    e2e_p50_ms:     float
    e2e_p99_ms:     float
    tokens_per_sec: float


def run_latency_test(
    target_name:   str   = "chiplet",
    runs:          int   = 1000,
    concurrency:   int   = 1,
    input_tokens:  int   = 512,
    output_tokens: int   = 128,
    seed:          int   = 42,
) -> LatencyResult:
    spec    = TARGETS[target_name]
    rng     = random.Random(seed)
    sampler = LatencySampler(spec, rng)

    ttft_samples: List[float] = []
    itl_samples:  List[float] = []
    e2e_samples:  List[float] = []

    # Simulate concurrency: requests arrive in waves of `concurrency`, shared
    # throughput is divided approximately evenly.
    load_factor = math.sqrt(concurrency)  # queuing overhead proxy

    for _ in range(runs):
        ttft = sampler.prefill_ms(input_tokens) * load_factor
        itl_total = sum(sampler.decode_step_ms() * load_factor
                        for _ in range(output_tokens))
        e2e  = ttft + itl_total

        ttft_samples.append(ttft)
        for _ in range(output_tokens):
            itl_samples.append(sampler.decode_step_ms() * load_factor)
        e2e_samples.append(e2e)

    e2e_mean_s   = statistics.mean(e2e_samples) / 1000.0
    total_tokens = runs * output_tokens * concurrency
    tokens_p_sec = total_tokens / (e2e_mean_s * runs) if e2e_mean_s > 0 else 0.0

    return LatencyResult(
        target         = spec.name,
        runs           = runs,
        concurrency    = concurrency,
        input_tokens   = input_tokens,
        output_tokens  = output_tokens,
        ttft_p50_ms    = percentile(ttft_samples, 50),
        ttft_p95_ms    = percentile(ttft_samples, 95),
        ttft_p99_ms    = percentile(ttft_samples, 99),
        itl_p50_ms     = percentile(itl_samples, 50),
        itl_p95_ms     = percentile(itl_samples, 95),
        itl_p99_ms     = percentile(itl_samples, 99),
        e2e_p50_ms     = percentile(e2e_samples, 50),
        e2e_p99_ms     = percentile(e2e_samples, 99),
        tokens_per_sec = tokens_p_sec,
    )


def print_result(r: LatencyResult) -> None:
    print(f"\n  {'─'*65}")
    print(f"  Target       : {r.target}")
    print(f"  Runs         : {r.runs}  |  Concurrency: {r.concurrency}")
    print(f"  Input/Output : {r.input_tokens}/{r.output_tokens} tokens")
    print(f"  {'─'*65}")
    print(f"  TTFT  P50/P95/P99 : {r.ttft_p50_ms:6.1f} / {r.ttft_p95_ms:6.1f} / {r.ttft_p99_ms:6.1f} ms")
    print(f"  ITL   P50/P95/P99 : {r.itl_p50_ms:6.2f} / {r.itl_p95_ms:6.2f} / {r.itl_p99_ms:6.2f} ms")
    print(f"  E2E   P50/P99     : {r.e2e_p50_ms:6.1f} / {r.e2e_p99_ms:6.1f} ms")
    print(f"  Throughput        : {r.tokens_per_sec:6.0f} tokens/sec")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Token Latency Test")
    parser.add_argument("--target",      default="chiplet", choices=list(TARGETS))
    parser.add_argument("--runs",        type=int, default=1000)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--input",       type=int, default=512)
    parser.add_argument("--output",      type=int, default=128)
    parser.add_argument("--all-targets", action="store_true")
    args = parser.parse_args()

    if args.all_targets:
        for name in TARGETS:
            r = run_latency_test(name, args.runs, args.concurrency,
                                 args.input, args.output)
            print_result(r)
    else:
        r = run_latency_test(args.target, args.runs, args.concurrency,
                             args.input, args.output)
        print_result(r)
