// GhostBrain — Energy & Power Estimator
// Estimates energy consumption and power draw per kernel using activity factors
// and per-operation energy models calibrated against published chiplet specs.

#include <cmath>
#include <cstdint>
#include <string>
#include <unordered_map>

// ── Energy Model Constants (pJ per operation) ─────────────────────────────────
// Calibrated for a 7 nm process node, 1.0V Vdd.

static const std::unordered_map<std::string, double> ENERGY_PJ = {
    {"mac_fp32",   3.7},  // pJ per multiply-accumulate (FP32)
    {"mac_fp16",   1.1},  // pJ per MAC (FP16)
    {"mac_int8",   0.4},  // pJ per MAC (INT8)
    {"mac_int4",   0.2},  // pJ per MAC (INT4, simulated)
    {"sread_hbm",  3.5},  // pJ per byte read from HBM3
    {"swrite_hbm", 4.2},  // pJ per byte written to HBM3
    {"sread_l2",   0.8},  // pJ per byte read from L2 SRAM
    {"swrite_l2",  1.0},  // pJ per byte written to L2 SRAM
    {"sread_l1",   0.2},  // pJ per byte read from L1 SRAM
    {"noc_flit",   0.5},  // pJ per 64-byte flit traversal (one hop)
    {"leak_core",  5.0},  // pJ per cycle per core (leakage)
};

// ── Kernel Energy Profile ─────────────────────────────────────────────────────

struct KernelEnergyProfile {
  std::string name;
  uint64_t    macs;
  uint64_t    hbm_read_bytes;
  uint64_t    hbm_write_bytes;
  uint64_t    l2_read_bytes;
  uint64_t    l2_write_bytes;
  uint64_t    noc_flits;
  uint64_t    active_cycles;
  uint64_t    core_count;
  std::string precision;  // "fp32" | "fp16" | "int8" | "int4"
};

struct EnergyEstimate {
  double compute_pJ;
  double hbm_pJ;
  double l2_pJ;
  double noc_pJ;
  double leakage_pJ;
  double total_pJ;
  double total_mJ;
  double avg_power_mW; // at the given compute frequency
};

// ── Estimator ─────────────────────────────────────────────────────────────────

static double pj(const std::string& key) {
  auto it = ENERGY_PJ.find(key);
  return it != ENERGY_PJ.end() ? it->second : 0.0;
}

EnergyEstimate estimate_kernel_energy(const KernelEnergyProfile& kp,
                                      int freq_ghz = 4) {
  std::string mac_key = "mac_fp32";
  if      (kp.precision == "fp16") mac_key = "mac_fp16";
  else if (kp.precision == "int8") mac_key = "mac_int8";
  else if (kp.precision == "int4") mac_key = "mac_int4";

  EnergyEstimate est{};
  est.compute_pJ  = static_cast<double>(kp.macs)               * pj(mac_key);
  est.hbm_pJ      = static_cast<double>(kp.hbm_read_bytes)     * pj("sread_hbm")
                  + static_cast<double>(kp.hbm_write_bytes)    * pj("swrite_hbm");
  est.l2_pJ       = static_cast<double>(kp.l2_read_bytes)      * pj("sread_l2")
                  + static_cast<double>(kp.l2_write_bytes)     * pj("swrite_l2");
  est.noc_pJ      = static_cast<double>(kp.noc_flits)          * pj("noc_flit");
  est.leakage_pJ  = static_cast<double>(kp.active_cycles)
                  * static_cast<double>(kp.core_count)         * pj("leak_core");

  est.total_pJ    = est.compute_pJ + est.hbm_pJ + est.l2_pJ + est.noc_pJ + est.leakage_pJ;
  est.total_mJ    = est.total_pJ / 1e9;

  // Power (mW) = Energy (pJ) / time (ns)  — time_ns = active_cycles / freq_GHz
  double time_ns  = static_cast<double>(kp.active_cycles) / static_cast<double>(freq_ghz);
  est.avg_power_mW = (time_ns > 0) ? (est.total_pJ / time_ns) : 0.0;

  return est;
}

// ── Thermal Model (simplified) ────────────────────────────────────────────────

struct ThermalModel {
  double theta_ja_CpW;     // junction-to-ambient thermal resistance (°C/W)
  double ambient_C;        // ambient temperature (°C)
  double tdp_W;            // thermal design point

  double junction_temp_C(double avg_power_mW) const {
    double power_W = avg_power_mW / 1000.0;
    return ambient_C + theta_ja_CpW * power_W;
  }

  bool exceeds_tjunction_max(double avg_power_mW, double tj_max_C = 105.0) const {
    return junction_temp_C(avg_power_mW) > tj_max_C;
  }
};

static ThermalModel ghostbrain_chiplet_thermal() {
  return {0.35, 35.0, 300.0}; // 0.35 °C/W, 35 °C ambient, 300 W TDP
}
