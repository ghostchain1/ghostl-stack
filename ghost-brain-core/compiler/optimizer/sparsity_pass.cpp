// GhostBrain Compiler — Sparsity Pass
// Detects and exploits structured sparsity (2:4, block-sparse) in weight tensors.

#include "optimizer/sparsity_pass.h"
#include "ghosttensor_dialect/ghost_ir.h"
#include <algorithm>
#include <cmath>
#include <vector>

namespace ghostbrain::optimizer {

// ── Sparsity Analysis ─────────────────────────────────────────────────────────
//
// Two sparsity formats are exploited:
//
//  1. 2:4 structured sparsity (NVIDIA Ampere+ and GhostBrain sparse core units)
//     Every 4 consecutive values have at most 2 non-zeros.
//     Compression ratio: 2×  (values + 2-bit indices per group-of-4)
//
//  2. Block-sparse (16×16 blocks) for embedding tables and sparse attention
//     Blocks with density < BLOCK_ZERO_THRESHOLD are pruned entirely.

static constexpr float BLOCK_ZERO_THRESHOLD = 0.05f;  // 95% zeros ⇒ prune block
static constexpr float SPARSE_RATIO_MIN     = 0.50f;  // ≥ 50% zeros to convert

struct SparsityProfile {
  float density;        // fraction of non-zero elements
  bool  is_2_4;         // satisfies 2:4 pattern
  bool  is_block_sparse;
};

// Static analysis of a tensor value's known sparsity annotations.
static SparsityProfile analyseSparsity(const GhostValue *v) {
  SparsityProfile p{};
  const auto &attrs = v->type().annotations;
  auto it = attrs.find("sparsity_density");
  if (it != attrs.end()) {
    p.density = std::stof(it->second);
  } else {
    p.density = 1.0f; // assume dense if unknown
  }
  p.is_2_4         = p.density <= 0.5f;
  p.is_block_sparse = p.density <= BLOCK_ZERO_THRESHOLD;
  return p;
}

// ── Conversion ────────────────────────────────────────────────────────────────

static void convertToSparseOp(GhostBlock *block, GhostOp *op) {
  if (op->operands().empty()) return;
  GhostValue *weight = op->operands().size() > 1 ? op->operands()[1] : op->operands()[0];
  auto sp = analyseSparsity(weight);

  if (sp.density > SPARSE_RATIO_MIN) return; // not sparse enough

  std::string sparseOpcode;
  auto attrs = op->attrs();

  if (sp.is_2_4) {
    sparseOpcode     = "matmul_2_4_sparse";
    attrs["sparse"]  = "2:4";
  } else if (sp.is_block_sparse) {
    sparseOpcode     = "spmv_block16";
    attrs["sparse"]  = "block16";
  } else {
    sparseOpcode     = "matmul_unstructured_sparse";
    attrs["sparse"]  = "unstructured";
  }

  block->addOp(sparseOpcode, op->operands(), op->results(), std::move(attrs));
  block->removeOp(op);
}

SparsityPass::Result SparsityPass::run(GhostModule &mod) {
  Result result{};
  for (auto &fn : mod.functions()) {
    for (auto &blk : fn->blocks()) {
      std::vector<GhostOp *> matmuls;
      for (auto &op : blk->ops()) {
        if (op->opcode() == "matmul" || op->opcode() == "matmul_tiled")
          matmuls.push_back(op.get());
      }
      for (auto *op : matmuls) {
        size_t before = blk->ops().size();
        convertToSparseOp(blk.get(), op);
        if (blk->ops().size() != before) ++result.sparseOpsGenerated;
      }
    }
  }
  return result;
}

} // namespace ghostbrain::optimizer
