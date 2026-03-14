"""
GhostBrain — thermal model (steady-state + transient).

Complements energy_estimator.cpp (which computes per-kernel energy budgets)
with junction-temperature tracking, TDP enforcement, and throttle signalling.

Standalone Python companion to simulator/power_model/energy_estimator.cpp.
The C++ side owns the per-kernel pJ/op accounting; this module owns time-domain
thermal tracking so that a long workload trace can be checked for overtemp.

Usage (library):
    from thermal_model import ThermalModel, WorkloadTrace
    tm = ThermalModel()
    result = tm.simulate(trace)
    print(result.max_junction_C, result.throttle_events)

Usage (CLI):
    python thermal_model.py --trace example_trace.json
"""

from __future__ import annotations

import json
import math
import argparse
from dataclasses import dataclass, field
from typing import List, Tuple


# ── Constants (7nm TSMC-calibrated) ──────────────────────────────────────────
THETA_JA_C_PER_W   = 0.35    # junction-to-ambient thermal resistance (°C/W)
THETA_JC_C_PER_W   = 0.10    # junction-to-case (with high-end TIM)
C_TH_J_PER_C       = 8.0     # thermal capacitance (J/°C) for transient model
TDP_W              = 300.0   # design thermal power
AMBIENT_C          = 35.0    # inlet air temperature
T_JUNCTION_MAX_C   = 105.0   # max allowable junction temp
THROTTLE_TEMP_C    = 95.0    # soft-throttle onset
DT_S               = 1e-3    # simulation time-step (1 ms)


# ── Data Structures ───────────────────────────────────────────────────────────

@dataclass
class PowerInterval:
    """A rectangular power pulse: [t_start, t_start+duration) at power_W."""
    t_start_s:  float
    duration_s: float
    power_W:    float
    kernel_tag: str = ""


@dataclass
class WorkloadTrace:
    """Ordered list of power intervals describing a full workload."""
    intervals: List[PowerInterval] = field(default_factory=list)

    @classmethod
    def from_json(cls, path: str) -> "WorkloadTrace":
        with open(path) as f:
            data = json.load(f)
        trace = cls()
        for item in data:
            trace.intervals.append(PowerInterval(**item))
        return trace

    @classmethod
    def example(cls) -> "WorkloadTrace":
        """~5-second burst workload for smoke testing."""
        return cls(intervals=[
            PowerInterval(0.0,   0.5, 280.0, "matmul_warmup"),
            PowerInterval(0.5,   2.0, 310.0, "llm_prefill"),    # exceeds TDP
            PowerInterval(2.5,   1.5, 260.0, "llm_decode"),
            PowerInterval(4.0,   0.5,  50.0, "idle"),
            PowerInterval(4.5,   0.5, 295.0, "matmul_burst"),
        ])


@dataclass
class ThermalResult:
    t_samples_s:            List[float]
    junction_temp_C:        List[float]
    throttle_flags:         List[bool]
    max_junction_C:         float
    throttle_events:        int
    thermal_violation:      bool
    avg_power_W:            float
    peak_power_W:           float


# ── Thermal Model ─────────────────────────────────────────────────────────────

@dataclass
class ThermalModel:
    """
    First-order RC lumped thermal model.

    dT_j/dt = (P_inst - (T_j - T_amb) / θ_ja) / C_th
    """
    theta_ja:    float = THETA_JA_C_PER_W
    theta_jc:    float = THETA_JC_C_PER_W
    c_th:        float = C_TH_J_PER_C
    tdp_W:       float = TDP_W
    ambient_C:   float = AMBIENT_C
    t_max_C:     float = T_JUNCTION_MAX_C
    throttle_C:  float = THROTTLE_TEMP_C
    dt_s:        float = DT_S

    def _power_at(self, t: float, intervals: List[PowerInterval]) -> Tuple[float, str]:
        """Return instantaneous power and kernel tag at time t."""
        for iv in intervals:
            if iv.t_start_s <= t < iv.t_start_s + iv.duration_s:
                return iv.power_W, iv.kernel_tag
        return 0.0, "idle"

    def _throttled_power(self, raw_W: float, t_j: float) -> float:
        """Apply soft-throttle: linearly reduce power from throttle_C to t_max_C."""
        if t_j < self.throttle_C:
            return raw_W
        headroom = max(self.t_max_C - t_j, 0.0)
        scale    = headroom / (self.t_max_C - self.throttle_C)
        return raw_W * max(scale, 0.0)

    def simulate(self, trace: WorkloadTrace) -> ThermalResult:
        if not trace.intervals:
            return ThermalResult([], [], [], self.ambient_C, 0, False, 0.0, 0.0)

        total_time = max(iv.t_start_s + iv.duration_s for iv in trace.intervals)
        n_steps    = int(math.ceil(total_time / self.dt_s))

        t_j             = self.ambient_C   # initial junction temperature
        t_samples       : List[float] = []
        tj_samples      : List[float] = []
        throttle_flags  : List[bool]  = []
        throttle_events = 0
        energy_J        = 0.0
        peak_power      = 0.0

        for i in range(n_steps):
            t = i * self.dt_s
            raw_W, _tag = self._power_at(t, trace.intervals)
            p_W = self._throttled_power(raw_W, t_j)
            is_throttled = p_W < raw_W * 0.99  # >1% reduction counts

            # RC thermal step (forward Euler)
            q_diss = (t_j - self.ambient_C) / self.theta_ja
            dt_j   = (p_W - q_diss) / self.c_th * self.dt_s
            t_j   += dt_j

            energy_J   += p_W * self.dt_s
            peak_power  = max(peak_power, raw_W)

            if is_throttled:
                throttle_events += 1

            t_samples.append(t)
            tj_samples.append(t_j)
            throttle_flags.append(is_throttled)

        max_tj     = max(tj_samples)
        avg_power  = energy_J / (n_steps * self.dt_s) if n_steps > 0 else 0.0

        return ThermalResult(
            t_samples_s         = t_samples,
            junction_temp_C     = tj_samples,
            throttle_flags      = throttle_flags,
            max_junction_C      = max_tj,
            throttle_events     = throttle_events,
            thermal_violation   = max_tj > self.t_max_C,
            avg_power_W         = avg_power,
            peak_power_W        = peak_power,
        )


# ── Summary Report ────────────────────────────────────────────────────────────

def print_report(result: ThermalResult) -> None:
    print(f"\n{'─'*60}")
    print(f"  GhostBrain Thermal Simulation Report")
    print(f"{'─'*60}")
    print(f"  Peak junction temp : {result.max_junction_C:.1f} °C  "
          f"({'⚠  VIOLATION' if result.thermal_violation else 'OK'})")
    print(f"  Throttle events    : {result.throttle_events}")
    print(f"  Avg power          : {result.avg_power_W:.1f} W")
    print(f"  Peak power         : {result.peak_power_W:.1f} W")
    print(f"{'─'*60}\n")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GhostBrain Thermal Model")
    parser.add_argument("--trace", default=None, help="Path to workload trace JSON")
    parser.add_argument("--plot",  action="store_true")
    args = parser.parse_args()

    if args.trace:
        trace = WorkloadTrace.from_json(args.trace)
    else:
        print("No trace specified — using built-in example trace.")
        trace = WorkloadTrace.example()

    model  = ThermalModel()
    result = model.simulate(trace)
    print_report(result)

    if args.plot:
        try:
            import matplotlib.pyplot as plt  # type: ignore
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 6), sharex=True)
            ax1.plot(result.t_samples_s, result.junction_temp_C, label="T_j (°C)")
            ax1.axhline(T_JUNCTION_MAX_C, color="red",    linestyle="--", label="T_max")
            ax1.axhline(THROTTLE_TEMP_C,  color="orange", linestyle="--", label="T_throttle")
            ax1.set_ylabel("Junction Temp (°C)")
            ax1.legend()
            ax1.grid(True, alpha=0.3)

            throttle_x = [t for t, f in zip(result.t_samples_s, result.throttle_flags) if f]
            ax2.scatter(throttle_x, [1]*len(throttle_x), s=2, color="red", label="throttle")
            ax2.set_ylabel("Throttle Active")
            ax2.set_xlabel("Time (s)")
            ax2.grid(True, alpha=0.3)

            plt.suptitle("GhostBrain Chiplet — Thermal Trace")
            plt.tight_layout()
            plt.show()
        except ImportError:
            print("matplotlib not installed — skipping plot")
