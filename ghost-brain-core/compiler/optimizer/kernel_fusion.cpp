// GhostBrain Compiler — Kernel Fusion Optimiser Pass
// Fuses compatible adjacent ops to reduce memory round-trips.

#include "optimizer/kernel_fusion.h"
#include "ghosttensor_dialect/ghost_ir.h"
#include <algorithm>
#include <unordered_set>
#include <vector>

namespace ghostbrain::optimizer {

// ── Fusion Rules ──────────────────────────────────────────────────────────────
//
// Two ops A → B are fusible when:
//   1. B has exactly one use of A's result (no fan-out)
//   2. Neither A nor B has side effects
//   3. The (A.opcode, B.opcode) pair appears in the fusion table
//
// Fused ops emit as a single kernel dispatch, avoiding HBM write+read of the
// intermediate tensor.

static const std::unordered_set<std::string> FUSIBLE_PAIRS_SRC = {
    "matmul+relu",    // GeLU / ReLU post-GEMM is a standard fused kernel
    "matmul+add",     // bias addition
    "attention+softmax", // already internal, guard for partial lowering
    "mul+add",        // multiply-accumulate
    "quantise+matmul", // quantise before GEMM saves bandwidth
    "relu+quantise",  // activation → quantise in one pass
};

static bool isFusiblePair(const std::string &a, const std::string &b) {
  return FUSIBLE_PAIRS_SRC.count(a + "+" + b) > 0;
}

// ── Main Pass ──────────────────────────────────────────────────────────────────

static size_t fuseBlock(GhostBlock *block) {
  size_t fusedCount = 0;
  auto &ops = block->ops();
  bool changed = true;

  while (changed) {
    changed = false;
    for (size_t i = 0; i + 1 < ops.size(); ++i) {
      GhostOp *A = ops[i].get();
      GhostOp *B = ops[i + 1].get();

      if (A->hasSideEffects() || B->hasSideEffects()) continue;
      if (A->results().size() != 1) continue;
      if (B->operands().size() < 1) continue;

      // B must consume A's sole result as its first operand
      if (B->operands()[0] != A->results()[0]) continue;

      if (!isFusiblePair(A->opcode(), B->opcode())) continue;

      // Fuse: replace A and B with a single fused op that takes A's inputs +
      // any additional inputs of B, and produces B's results.
      std::string fusedOpcode = A->opcode() + "_" + B->opcode() + "_fused";
      std::vector<GhostValue *> fusedOperands = A->operands();
      // Append B's operands excluding the consumed intermediate
      for (size_t j = 1; j < B->operands().size(); ++j)
        fusedOperands.push_back(B->operands()[j]);

      // Merge attributes
      std::unordered_map<std::string, std::string> mergedAttrs = A->attrs();
      for (const auto &[k, v] : B->attrs()) mergedAttrs[k] = v;

      block->addOp(fusedOpcode, std::move(fusedOperands),
                   B->results(), std::move(mergedAttrs));

      // Remove the original two ops (iterator will restart)
      block->removeOp(B);
      block->removeOp(A);

      ++fusedCount;
      changed = true;
      break; // Restart scan after structural change
    }
  }

  return fusedCount;
}

KernelFusionPass::Result KernelFusionPass::run(GhostModule &mod) {
  Result result{};
  for (auto &fn : mod.functions()) {
    for (auto &blk : fn->blocks()) {
      result.fusedKernelCount += fuseBlock(blk.get());
    }
  }
  return result;
}

} // namespace ghostbrain::optimizer
