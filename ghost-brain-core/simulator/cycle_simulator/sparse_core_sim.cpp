// GhostBrain — Sparse Core Cycle Simulator
// Models the GhostBrain sparse core units (SC0, SC1) executing SpMSpM and SpMV
// in 2:4 structured and block-sparse modes.

#include <cassert>
#include <cstdint>
#include <vector>

// ── Sparse Core Parameters ────────────────────────────────────────────────────

static constexpr int SC_LANES         = 64;   // 64 active lanes per sparse core
static constexpr int SC_FREQ_GHZ      = 4;
static constexpr int SC_2_4_SPEEDUP   = 2;    // 2× vs dense (structural 50% sparsity)
static constexpr int SC_BLOCK_MIN_NNZ = 1;    // minimum non-zeros per 16×16 block

// ── 2:4 Structured Sparsity CSC Format ───────────────────────────────────────

struct Sparse24Matrix {
  int                   rows, cols;
  std::vector<float>    values;     // 2 values per 4-element group
  std::vector<uint8_t>  indices;    // 2-bit index per value (0–3 position in group)
};

struct SparseCycleStats {
  uint64_t compute_cycles;
  uint64_t overhead_cycles; // index decoding + scatter
  uint64_t total_macs;
  double   speedup_vs_dense;
  double   throughput_tops;
};

// ── 2:4 SpMM Simulation ───────────────────────────────────────────────────────

/**
 * Simulate sparse matrix multiplication using the 2:4 structured sparsity format.
 * Returns cycle statistics and computes the output matrix.
 *
 * @param A_sparse   Weight matrix in 2:4 format
 * @param B_dense    Activation matrix (dense, K × N row-major)
 * @param N          Column count of B
 * @param C_out      Output matrix (rows × N)
 */
SparseCycleStats sparse_core_sim_2_4(
    const Sparse24Matrix& A_sparse,
    const std::vector<float>& B_dense,
    int N,
    std::vector<float>& C_out)
{
  int M = A_sparse.rows;
  int K = A_sparse.cols;
  assert((int)B_dense.size() == K * N);

  C_out.assign(static_cast<size_t>(M * N), 0.0f);

  SparseCycleStats stats{};
  int group_count = (K + 3) / 4; // number of 4-element groups per row

  for (int i = 0; i < M; ++i) {
    for (int g = 0; g < group_count; ++g) {
      // Each group has exactly 2 non-zeros
      for (int s = 0; s < 2; ++s) {
        int val_idx = i * group_count * 2 + g * 2 + s;
        if (val_idx >= (int)A_sparse.values.size()) break;
        float  val  = A_sparse.values[val_idx];
        int    kpos = g * 4 + A_sparse.indices[val_idx]; // decoded column index

        for (int j = 0; j < N; ++j)
          C_out[i * N + j] += val * B_dense[kpos * N + j];

        stats.total_macs += static_cast<uint64_t>(N);
      }
      // 1 cycle per group (2 MACs) when pipelined across SC_LANES lanes
      stats.compute_cycles  += (N + SC_LANES - 1) / SC_LANES;
      stats.overhead_cycles += 1; // index decode
    }
  }

  uint64_t dense_macs   = static_cast<uint64_t>(M) * K * N;
  double   dense_cycles = static_cast<double>(dense_macs) / SC_LANES;
  stats.speedup_vs_dense = (stats.compute_cycles > 0)
      ? dense_cycles / static_cast<double>(stats.compute_cycles)
      : 0.0;

  double total_cy = static_cast<double>(stats.compute_cycles + stats.overhead_cycles);
  double time_ns  = total_cy / static_cast<double>(SC_FREQ_GHZ);
  stats.throughput_tops = (time_ns > 0)
      ? (2.0 * static_cast<double>(stats.total_macs)) / (time_ns * 1e3)
      : 0.0;

  return stats;
}
