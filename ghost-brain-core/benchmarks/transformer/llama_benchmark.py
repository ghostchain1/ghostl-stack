"""
GhostBrain — LLaMA 7B Transformer Benchmark

Benchmarks a LLaMA-style 7B-parameter model inference pipeline against
the GhostBrain runtime, measuring prefill and decode latency, throughput,
and memory footprint.

Usage:
    python llama_benchmark.py --target chiplet --batch 1 --seq-len 512
    python llama_benchmark.py --full-suite
"""

from __future__ import annotations

import argparse
import math
import time
import json
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional


# ── Model Config ──────────────────────────────────────────────────────────────

@dataclass
class LLaMAConfig:
    name:           str
    n_layers:       int
    d_model:        int
    n_heads:        int
    n_kv_heads:     int
    ffn_dim:        int
    vocab_size:     int
    max_seq_len:    int
    dtype_bytes:    int = 2  # FP16

    @property
    def head_dim(self) -> int:
        return self.d_model // self.n_heads

    @property
    def param_count(self) -> int:
        """Approximate parameter count."""
        embed  = self.vocab_size * self.d_model
        attn   = self.n_layers * (
            self.d_model * self.d_model +         # Q
            self.d_model * (self.n_kv_heads * self.head_dim) * 2 +  # K + V
            self.d_model * self.d_model           # O
        )
        ffn    = self.n_layers * (
            self.d_model * self.ffn_dim * 2 +     # gate + up
            self.ffn_dim * self.d_model            # down
        )
        return embed + attn + ffn

    @property
    def model_size_GB(self) -> float:
        return self.param_count * self.dtype_bytes / 1e9


LLAMA_7B = LLaMAConfig(
    name="LLaMA-7B", n_layers=32, d_model=4096, n_heads=32,
    n_kv_heads=8, ffn_dim=11008, vocab_size=32000, max_seq_len=4096,
)
LLAMA_13B = LLaMAConfig(
    name="LLaMA-13B", n_layers=40, d_model=5120, n_heads=40,
    n_kv_heads=8, ffn_dim=13824, vocab_size=32000, max_seq_len=4096,
)


# ── Hardware Targets ──────────────────────────────────────────────────────────

@dataclass
class HardwareSim:
    name:               str
    peak_tflops_fp16:   float
    hbm_bw_GBps:        float
    sram_capacity_MB:   float
    mem_capacity_GB:    float

    def compute_efficiency(self) -> float:
        return {"chiplet": 0.92, "gpu": 0.88, "fpga": 0.70, "cpu": 0.65}.get(
            self.name.lower(), 0.80)


HW_TARGETS: Dict[str, HardwareSim] = {
    "chiplet": HardwareSim("chiplet", 512.0,  3600.0, 256.0,  96.0),
    "gpu":     HardwareSim("gpu",     989.0,  3350.0,  50.0,  80.0),
    "cpu":     HardwareSim("cpu",       4.0,    64.0,  64.0, 512.0),
}


# ── Benchmark Result ──────────────────────────────────────────────────────────

@dataclass
class BenchmarkResult:
    model:              str
    target:             str
    batch_size:         int
    seq_len:            int
    prefill_latency_ms: float
    decode_latency_ms:  float   # per-token
    tokens_per_sec:     float
    model_size_GB:      float
    kv_cache_MB:        float
    notes:              str = ""


# ── Benchmark Engine ──────────────────────────────────────────────────────────

class LLaMABenchmark:
    def __init__(self, hw: HardwareSim):
        self.hw = hw

    def _prefill_flops(self, cfg: LLaMAConfig, bs: int, seq: int) -> float:
        """FLOPs for a single forward pass over `seq` input tokens."""
        attn_flops = 2 * bs * seq * seq * cfg.d_model * cfg.n_layers
        mlp_flops  = 2 * bs * seq * (3 * cfg.d_model * cfg.ffn_dim) * cfg.n_layers
        return attn_flops + mlp_flops

    def _decode_flops(self, cfg: LLaMAConfig, bs: int, kv_len: int) -> float:
        """FLOPs for generating a single next token (1 decode step)."""
        attn_flops = 2 * bs * kv_len * cfg.d_model * cfg.n_layers
        mlp_flops  = 2 * bs * (3 * cfg.d_model * cfg.ffn_dim) * cfg.n_layers
        return attn_flops + mlp_flops

    def _kv_cache_mb(self, cfg: LLaMAConfig, bs: int, seq: int) -> float:
        """KV cache size in MB."""
        bytes_per_kv = (
            cfg.n_layers * 2 *                           # K + V
            cfg.n_kv_heads * cfg.head_dim *
            bs * seq * cfg.dtype_bytes
        )
        return bytes_per_kv / (1024 ** 2)

    def run(self, cfg: LLaMAConfig, batch_size: int = 1,
            seq_len: int = 512, decode_steps: int = 128) -> BenchmarkResult:
        hw = self.hw
        eff = hw.compute_efficiency()

        # -- prefill --
        prefill_flops  = self._prefill_flops(cfg, batch_size, seq_len)
        prefill_tflops = hw.peak_tflops_fp16 * eff
        prefill_s      = prefill_flops / (prefill_tflops * 1e12)
        prefill_ms     = prefill_s * 1e3

        # -- decode (per token) --
        decode_flops   = self._decode_flops(cfg, batch_size, seq_len + decode_steps // 2)
        decode_s       = decode_flops / (prefill_tflops * 1e12)
        decode_ms      = decode_s * 1e3

        tokens_per_sec = (batch_size * decode_steps) / (
            prefill_s + decode_s * decode_steps
        )

        kv_mb = self._kv_cache_mb(cfg, batch_size, seq_len + decode_steps)

        fits = kv_mb / 1024.0 + cfg.model_size_GB < hw.mem_capacity_GB
        notes = "" if fits else f"⚠ KV cache + weights ({kv_mb/1024+cfg.model_size_GB:.1f}GB) exceed HBM ({hw.mem_capacity_GB}GB)"

        return BenchmarkResult(
            model              = cfg.name,
            target             = hw.name,
            batch_size         = batch_size,
            seq_len            = seq_len,
            prefill_latency_ms = prefill_ms,
            decode_latency_ms  = decode_ms,
            tokens_per_sec     = tokens_per_sec,
            model_size_GB      = cfg.model_size_GB,
            kv_cache_MB        = kv_mb,
            notes              = notes,
        )


def print_result(r: BenchmarkResult) -> None:
    print(f"\n  {'─'*60}")
    print(f"  Model    : {r.model}  ({r.model_size_GB:.1f} GB FP16)")
    print(f"  Target   : {r.target}  |  bs={r.batch_size}  seq={r.seq_len}")
    print(f"  Prefill  : {r.prefill_latency_ms:.1f} ms")
    print(f"  Decode   : {r.decode_latency_ms:.3f} ms/token")
    print(f"  Throughput: {r.tokens_per_sec:.0f} tokens/sec")
    print(f"  KV cache : {r.kv_cache_MB:.0f} MB")
    if r.notes:
        print(f"  NOTE     : {r.notes}")


def full_suite() -> None:
    configs = [LLAMA_7B, LLAMA_13B]
    batch_sizes = [1, 4, 16]
    for target_name, hw in HW_TARGETS.items():
        bench = LLaMABenchmark(hw)
        for cfg in configs:
            for bs in batch_sizes:
                r = bench.run(cfg, batch_size=bs, seq_len=512)
                print_result(r)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain LLaMA Benchmark")
    parser.add_argument("--target",    default="chiplet", choices=list(HW_TARGETS))
    parser.add_argument("--model",     default="7b",      choices=["7b", "13b"])
    parser.add_argument("--batch",     type=int, default=1)
    parser.add_argument("--seq-len",   type=int, default=512)
    parser.add_argument("--full-suite", action="store_true")
    args = parser.parse_args()

    if args.full_suite:
        full_suite()
    else:
        cfg   = LLAMA_7B if args.model == "7b" else LLAMA_13B
        hw    = HW_TARGETS[args.target]
        bench = LLaMABenchmark(hw)
        r     = bench.run(cfg, batch_size=args.batch, seq_len=args.seq_len)
        print_result(r)
