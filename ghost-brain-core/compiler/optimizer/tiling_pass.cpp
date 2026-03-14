// GhostBrain Compiler — Tiling Pass
// Tiles large tensor ops into sub-tiles that fit in L1/L2 SRAM.

#include "optimizer/tiling_pass.h"
#include "ghosttensor_dialect/ghost_ir.h"
#include <cstdint>
#include <vector>

namespace ghostbrain::optimizer {

// ── Tile Size Selection ────────────────────────────────────────────────────────
//
// Tile sizes are chosen so that the working set (A-tile + B-tile + C-tile) fits
// within L1 SRAM (4 MB per core for the chiplet).
//
//   A-tile:  M × K × sizeof(dtype)
//   B-tile:  K × N × sizeof(dtype)
//   C-tile:  M × N × sizeof(dtype)
//   Total ≤ L1_SRAM_BYTES
//
// For FP16 (2 bytes), M=N=K=128: total = 3 × 128² × 2 = 98 KB  ✓

struct TileConfig {
  int64_t M, N, K;
};

static TileConfig selectTileConfig(GhostPrecision prec, int64_t target_sram_bytes) {
  int bytes_per_elem;
  switch (prec) {
  case GhostPrecision::FP32:  bytes_per_elem = 4; break;
  case GhostPrecision::FP16:
  case GhostPrecision::BF16:  bytes_per_elem = 2; break;
  case GhostPrecision::INT8:  bytes_per_elem = 1; break;
  case GhostPrecision::INT4:  bytes_per_elem = 1; break; // 2 elements packed
  default:                    bytes_per_elem = 4; break;
  }

  // Binary search for largest square tile fitting 3-buffer constraint
  int64_t best = 16;
  for (int64_t t = 16; t <= 512; t *= 2) {
    int64_t footprint = 3LL * t * t * bytes_per_elem;
    if (footprint <= target_sram_bytes) best = t;
    else break;
  }
  return {best, best, best};
}

// ── Tiling Core ───────────────────────────────────────────────────────────────

static void tileMatMulOp(GhostBlock *block, GhostOp *op) {
  auto precIt   = op->attrs().find("precision");
  auto targetIt = op->attrs().find("target");
  (void)targetIt;

  GhostPrecision prec = GhostPrecision::FP32;
  if (precIt != op->attrs().end() && precIt->second == "FP16")
    prec = GhostPrecision::FP16;

  // L1 SRAM per core: 4 MB for chiplet, 512 KB for CPU
  int64_t sram = 4 * 1024 * 1024;
  TileConfig tc = selectTileConfig(prec, sram);

  // Replace the original matmul with a tiled version (annotated attribute)
  // The runtime kernel scheduler reads tile_m/tile_n/tile_k to set loop bounds.
  auto attrs = op->attrs();
  attrs["tile_m"] = std::to_string(tc.M);
  attrs["tile_n"] = std::to_string(tc.N);
  attrs["tile_k"] = std::to_string(tc.K);
  attrs["tiled"]  = "1";

  block->addOp("matmul_tiled", op->operands(), op->results(), std::move(attrs));
  block->removeOp(op);
}

TilingPass::Result TilingPass::run(GhostModule &mod) {
  Result result{};
  for (auto &fn : mod.functions()) {
    for (auto &blk : fn->blocks()) {
      std::vector<GhostOp *> toTile;
      for (auto &op : blk->ops()) {
        if (op->opcode() == "matmul" || op->opcode() == "matmul_relu_fused")
          toTile.push_back(op.get());
      }
      for (auto *op : toTile) {
        tileMatMulOp(blk.get(), op);
        ++result.tiledOpCount;
      }
    }
  }
  return result;
}

} // namespace ghostbrain::optimizer
