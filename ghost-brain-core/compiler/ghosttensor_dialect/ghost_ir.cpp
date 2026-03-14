// GhostBrain — GhostIR In-Memory Representation
// Provides the in-process IR used by the optimiser passes before MLIR lowering.

#include "ghosttensor_dialect/ghost_ir.h"
#include <algorithm>
#include <cassert>
#include <stdexcept>
#include <unordered_map>

namespace ghostbrain {

// ── GhostValue ────────────────────────────────────────────────────────────────

GhostValue::GhostValue(GhostType ty, std::string name)
    : type_(std::move(ty)), name_(std::move(name)) {}

// ── GhostOp ───────────────────────────────────────────────────────────────────

GhostOp::GhostOp(std::string opcode,
                 std::vector<GhostValue *> operands,
                 std::vector<GhostValue *> results,
                 std::unordered_map<std::string, std::string> attrs)
    : opcode_(std::move(opcode)),
      operands_(std::move(operands)),
      results_(std::move(results)),
      attrs_(std::move(attrs)) {}

bool GhostOp::hasSideEffects() const {
  // Pure ops: matmul, add, mul, relu, softmax, attention, quantise, dequantise
  static const std::vector<std::string> pure_ops = {
      "matmul", "add", "mul", "relu", "softmax", "attention",
      "quantise", "dequantise", "spmv"};
  return std::find(pure_ops.begin(), pure_ops.end(), opcode_) == pure_ops.end();
}

// ── GhostBlock ────────────────────────────────────────────────────────────────

GhostOp *GhostBlock::addOp(std::string opcode,
                           std::vector<GhostValue *> operands,
                           std::vector<GhostValue *> results,
                           std::unordered_map<std::string, std::string> attrs) {
  ops_.push_back(std::make_unique<GhostOp>(
      std::move(opcode), std::move(operands), std::move(results),
      std::move(attrs)));
  return ops_.back().get();
}

void GhostBlock::removeOp(GhostOp *op) {
  ops_.erase(std::remove_if(ops_.begin(), ops_.end(),
                             [op](const auto &u) { return u.get() == op; }),
             ops_.end());
}

// ── GhostFunction ─────────────────────────────────────────────────────────────

GhostBlock *GhostFunction::addBlock() {
  blocks_.push_back(std::make_unique<GhostBlock>());
  return blocks_.back().get();
}

GhostValue *GhostFunction::addArgument(GhostType ty, std::string name) {
  args_.push_back(std::make_unique<GhostValue>(ty, std::move(name)));
  return args_.back().get();
}

// ── GhostModule ───────────────────────────────────────────────────────────────

GhostFunction *GhostModule::addFunction(std::string name) {
  functions_.push_back(std::make_unique<GhostFunction>(std::move(name)));
  return functions_.back().get();
}

GhostFunction *GhostModule::lookupFunction(const std::string &name) const {
  for (const auto &fn : functions_) {
    if (fn->name() == name) return fn.get();
  }
  return nullptr;
}

// ── IR Printer ────────────────────────────────────────────────────────────────

static std::string typeName(const GhostType &ty) {
  std::string s = "tensor<";
  for (size_t i = 0; i < ty.shape.size(); ++i) {
    s += std::to_string(ty.shape[i]);
    if (i + 1 < ty.shape.size()) s += 'x';
  }
  s += 'x';
  switch (ty.precision) {
  case GhostPrecision::FP32:  s += "f32"; break;
  case GhostPrecision::FP16:  s += "f16"; break;
  case GhostPrecision::BF16:  s += "bf16"; break;
  case GhostPrecision::INT8:  s += "i8"; break;
  case GhostPrecision::INT4:  s += "i4"; break;
  }
  s += '>';
  return s;
}

void GhostModule::print(std::ostream &os) const {
  os << "// GhostBrain GhostIR Module\n";
  for (const auto &fn : functions_) {
    os << "ghostfunc @" << fn->name() << "(";
    bool first = true;
    for (const auto &arg : fn->args()) {
      if (!first) os << ", ";
      os << '%' << arg->name() << " : " << typeName(arg->type());
      first = false;
    }
    os << ") {\n";
    for (const auto &blk : fn->blocks()) {
      for (const auto &op : blk->ops()) {
        os << "  " << op->opcode() << " ";
        for (auto *res : op->results()) os << '%' << res->name() << " ";
        os << "= (";
        for (size_t i = 0; i < op->operands().size(); ++i) {
          if (i) os << ", ";
          os << '%' << op->operands()[i]->name();
        }
        os << ")\n";
      }
    }
    os << "}\n";
  }
}

} // namespace ghostbrain
