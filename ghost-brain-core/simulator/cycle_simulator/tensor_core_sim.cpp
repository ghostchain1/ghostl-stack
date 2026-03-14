// GhostBrain — Tensor Core Cycle Simulator
// Cycle-accurate simulation of the GhostBrain 2D tensor core array.
//
// Models a single 128-MAC tensor core operating on INT8 inputs with FP32
// accumulation, matching the GhostBrain chiplet compute die specification.

#include <cassert>
#include <cstdint>
#include <cstring>
#include <numeric>
#include <vector>

// ── Tensor Core Parameters ────────────────────────────────────────────────────

static constexpr int TC_TILE_M = 16; // systolic array rows
static constexpr int TC_TILE_N = 8;  // systolic array cols
static constexpr int TC_TILE_K = 16; // inner dimension per cycle
static constexpr int TC_MACS   = TC_TILE_M * TC_TILE_N; // 128 MACs per cycle
static constexpr int TC_FREQ_GHZ = 4;
static constexpr int TC_PIPELINE_STAGES = 4;

// ── Cycle Stats ───────────────────────────────────────────────────────────────

struct TensorCoreCycleStats {
  uint64_t total_cycles;
  uint64_t compute_cycles;
  uint64_t stall_cycles;     // memory stalls
  uint64_t total_macs;
  double   utilisation_pct;  // (compute_cycles / total_cycles) * 100
  double   throughput_tops;  // 2 * MACs / total_cycles / freq
};

// ── Systolic GEMM Simulation ──────────────────────────────────────────────────

/**
 * Simulate the execution of a tiled GEMM on the tensor core array.
 *
 * @param A      FP32 input matrix A (M×K row-major)
 * @param B      FP32 input matrix B (K×N row-major)
 * @param M,N,K  Matrix dimensions
 * @returns      Simulation timing stats and result product matrix C
 */
TensorCoreCycleStats tensor_core_simulate_gemm(
    const std::vector<float>& A,
    const std::vector<float>& B,
    int M, int N, int K,
    std::vector<float>& C_out)
{
  assert((int)A.size() == M * K);
  assert((int)B.size() == K * N);

  C_out.assign(static_cast<size_t>(M * N), 0.0f);

  TensorCoreCycleStats stats{};

  // Tile loop: iterate over (M/TC_TILE_M) × (N/TC_TILE_N) × (K/TC_TILE_K) tiles
  for (int ti = 0; ti < M; ti += TC_TILE_M) {
    for (int tj = 0; tj < N; tj += TC_TILE_N) {
      for (int tk = 0; tk < K; tk += TC_TILE_K) {
        // Each (ti,tj,tk) tile takes TC_PIPELINE_STAGES + 1 effective cycles
        // (pipelined: after filling the systolic, one result per cycle)
        int m_len = std::min(TC_TILE_M, M - ti);
        int n_len = std::min(TC_TILE_N, N - tj);
        int k_len = std::min(TC_TILE_K, K - tk);

        // Compute the tile — naive reference kernel for functional correctness
        for (int i = 0; i < m_len; ++i)
          for (int j = 0; j < n_len; ++j)
            for (int k = 0; k < k_len; ++k)
              C_out[(ti + i) * N + (tj + j)] +=
                  A[(ti + i) * K + (tk + k)] * B[(tk + k) * N + (tj + j)];

        // Cycle model:
        // - k_len/TC_TILE_K fill cycles (stall if data not in L1)
        // - m_len * n_len result cycles (pipelined)
        uint64_t tile_compute_cycles = static_cast<uint64_t>(TC_PIPELINE_STAGES + k_len);
        uint64_t tile_stall_cycles   = (tk == 0) ? 2 : 0; // one stall per K-strip start

        stats.total_cycles   += tile_compute_cycles + tile_stall_cycles;
        stats.compute_cycles += tile_compute_cycles;
        stats.stall_cycles   += tile_stall_cycles;
        stats.total_macs     += static_cast<uint64_t>(m_len) * n_len * k_len;
      }
    }
  }

  stats.utilisation_pct =
      stats.total_cycles > 0
          ? (static_cast<double>(stats.compute_cycles) / stats.total_cycles) * 100.0
          : 0.0;

  // TOPS = 2 * total_MACs / (total_cycles / freq_GHz) / 1e12
  // Simplified: throughput in TOPS
  double time_ns = static_cast<double>(stats.total_cycles) / static_cast<double>(TC_FREQ_GHZ);
  stats.throughput_tops = (time_ns > 0)
      ? (2.0 * static_cast<double>(stats.total_macs)) / (time_ns * 1e3)
      : 0.0;

  return stats;
}

// ── Quick Functional Test ──────────────────────────────────────────────────────

float tensor_gemm(
    const std::vector<float>& A,
    const std::vector<float>& B,
    int M, int N, int K)
{
  std::vector<float> C;
  auto stats = tensor_core_simulate_gemm(A, B, M, N, K, C);
  (void)stats;
  return std::accumulate(C.begin(), C.end(), 0.0f);
}
