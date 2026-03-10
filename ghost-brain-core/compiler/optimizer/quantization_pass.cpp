// GhostBrain Compiler — Quantisation Pass
// Inserts quantise/dequantise ops around GEMM to enable INT8 / INT4 inference.

#include "optimizer/quantization_pass.h"
#include "ghosttensor_dialect/ghost_ir.h"
#include <cassert>
#include <vector>

namespace ghostbrain::optimizer {

// ── Strategy ──────────────────────────────────────────────────────────────────
//
// Two quantisation modes:
//
//   STATIC   — scale/zero_point computed offline from calibration dataset.
//              Inserted as constant tensors in the IR.
//              Preferred for production: no runtime overhead.
//
//   DYNAMIC  — scale computed per activation tensor at runtime.
//              Lower accuracy but no calibration required.
//              Used for untested models on first deployment.
//
// Weight quantisation: always INT8 per-channel (higher accuracy than per-tensor)
// Activation quantisation: INT8 per-tensor (dynamic, unless static calibration available)

enum class QuantMode { STATIC, DYNAMIC };

struct QuantConfig {
  QuantMode          mode        = QuantMode::DYNAMIC;
  GhostPrecision     targetPrec  = GhostPrecision::INT8;
  bool               quantWeights = true;
  bool               quantActivations = true;
};

// ── Calibration Constant Injection ────────────────────────────────────────────

static GhostValue *injectScaleConst(GhostFunction *fn, const std::string &name,
                                    float scale) {
  GhostType ty;
  ty.shape     = {1};
  ty.precision = GhostPrecision::FP32;
  ty.annotations["const_value"] = std::to_string(scale);
  return fn->addArgument(ty, name);  // treated as constant input in practice
}

// ── Pass Core ─────────────────────────────────────────────────────────────────

static void quantiseMatMul(GhostFunction *fn, GhostBlock *block, GhostOp *op,
                            const QuantConfig &cfg) {
  if (!cfg.quantWeights && !cfg.quantActivations) return;
  if (op->operands().size() < 2) return;

  GhostValue *A = op->operands()[0]; // activations
  GhostValue *B = op->operands()[1]; // weights

  // Inject scale/zero_point constants (mock values; real values from calibration)
  GhostValue *scaleA = injectScaleConst(fn, A->name() + "_scale", 1.0f / 127.0f);
  GhostValue *zpA    = injectScaleConst(fn, A->name() + "_zp",    0.0f);
  GhostValue *scaleB = injectScaleConst(fn, B->name() + "_scale", 1.0f / 127.0f);
  GhostValue *zpB    = injectScaleConst(fn, B->name() + "_zp",    0.0f);

  std::string precStr;
  switch (cfg.targetPrec) {
  case GhostPrecision::INT8: precStr = "INT8"; break;
  case GhostPrecision::INT4: precStr = "INT4"; break;
  default:                   precStr = "INT8"; break;
  }

  // Build quantised operand types
  GhostType qType;
  qType.shape     = A->type().shape;
  qType.precision = cfg.targetPrec;

  auto *qA = fn->addArgument(qType, A->name() + "_q");
  auto *qB = fn->addArgument(qType, B->name() + "_q");

  // Insert quantise ops before the matmul
  std::unordered_map<std::string, std::string> qAttrs{{"target_precision", precStr}};
  if (cfg.quantActivations)
    block->addOp("quantise", {A, scaleA, zpA}, {qA}, qAttrs);
  if (cfg.quantWeights)
    block->addOp("quantise", {B, scaleB, zpB}, {qB}, qAttrs);

  // Replace matmul operands with quantised versions
  auto newOperands = op->operands();
  if (cfg.quantActivations) newOperands[0] = qA;
  if (cfg.quantWeights)     newOperands[1] = qB;

  auto attrs = op->attrs();
  attrs["precision"] = precStr;

  // Re-insert the matmul with quantised inputs (output still FP32 via implicit dequant)
  block->addOp("matmul_int", std::move(newOperands), op->results(), std::move(attrs));
  block->removeOp(op);
}

QuantisationPass::Result QuantisationPass::run(GhostModule &mod,
                                               bool staticCalib) {
  QuantConfig cfg;
  cfg.mode = staticCalib ? QuantMode::STATIC : QuantMode::DYNAMIC;

  Result result{};
  for (auto &fn : mod.functions()) {
    for (auto &blk : fn->blocks()) {
      std::vector<GhostOp *> targets;
      for (auto &op : blk->ops())
        if (op->opcode() == "matmul" || op->opcode() == "matmul_tiled")
          targets.push_back(op.get());
      for (auto *op : targets) {
        quantiseMatMul(fn.get(), blk.get(), op, cfg);
        ++result.quantisedOps;
      }
    }
  }
  return result;
}

} // namespace ghostbrain::optimizer
