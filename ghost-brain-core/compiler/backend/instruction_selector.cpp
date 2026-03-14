// GhostBrain Compiler — Instruction Selector
// Maps GhostIR ops to concrete hardware instructions or library calls.

#include "backend/instruction_selector.h"
#include "ghosttensor_dialect/ghost_ir.h"
#include <stdexcept>

namespace ghostbrain::backend {

// ── Instruction Descriptor ────────────────────────────────────────────────────

struct Instruction {
  std::string mnemonic;     // hardware instruction or runtime stub name
  std::string encoding;     // binary encoding template (hex placeholder)
  int         latency_cy;   // measured latency in cycles
  bool        isPipelined;
};

// ── Selector Tables ───────────────────────────────────────────────────────────

static Instruction selectCpu(const std::string &opcode) {
  static const std::unordered_map<std::string, Instruction> tbl = {
      {"matmul",         {"VFMADD231PS", "0x66 0x0F 0x98", 5,  true}},
      {"matmul_int",     {"VPDPWSSD",    "0x66 0x0F 0xD2", 3,  true}},
      {"add",            {"VADDPS",      "0x66 0x0F 0x58", 4,  true}},
      {"mul",            {"VMULPS",      "0x66 0x0F 0x59", 4,  true}},
      {"relu",           {"VMAXPS",      "0x66 0x0F 0x5F", 4,  true}},
      {"softmax",        {"CALL ghostbrain_softmax_avx512", "N/A", 20, false}},
      {"attention",      {"CALL ghostbrain_flash_attention_cpu", "N/A", 50, false}},
      {"quantise",       {"VCVTPS2DQ",   "0x66 0x0F 0x5B", 3,  true}},
      {"dequantise",     {"VCVTDQ2PS",   "0x66 0x0F 0x5B", 3,  true}},
  };
  auto it = tbl.find(opcode);
  if (it != tbl.end()) return it->second;
  return {"CALL ghostbrain_fallback_" + opcode, "N/A", 100, false};
}

static Instruction selectGpu(const std::string &opcode) {
  static const std::unordered_map<std::string, Instruction> tbl = {
      {"matmul",         {"HMMA.16816.F32",  "0x97 0x??", 16, true}},
      {"matmul_int",     {"IMMA.16816.S32",  "0x9A 0x??",  8, true}},
      {"add",            {"FADD.F16",         "0x20 0x??",  2, true}},
      {"relu",           {"FMNMX.F16",        "0x24 0x??",  2, true}},
      {"attention",      {"CALL ghostbrain_flash_attn_cuda", "N/A", 10, false}},
  };
  auto it = tbl.find(opcode);
  if (it != tbl.end()) return it->second;
  return {"CALL ghostbrain_cuda_fallback_" + opcode, "N/A", 50, false};
}

static Instruction selectChiplet(const std::string &opcode) {
  static const std::unordered_map<std::string, Instruction> tbl = {
      {"matmul",         {"TC.GEMM.INT8",    "0x01 0x??",  2, true}},
      {"matmul_int",     {"TC.GEMM.INT8",    "0x01 0x??",  2, true}},
      {"matmul_2_4_sparse", {"SC.SGEMM.2:4","0x02 0x??",  1, true}},
      {"spmv_block16",   {"SC.SPMV.B16",     "0x03 0x??",  2, true}},
      {"add",            {"VU.ADD.FP16",      "0x10 0x??",  1, true}},
      {"relu",           {"VU.RELU.FP16",     "0x11 0x??",  1, true}},
      {"quantise",       {"VU.CVT.FP16.INT8", "0x20 0x??",  1, true}},
      {"dequantise",     {"VU.CVT.INT8.FP16", "0x21 0x??",  1, true}},
      {"attention",      {"TC.ATTN.FLASH",    "0x05 0x??",  4, true}},
  };
  auto it = tbl.find(opcode);
  if (it != tbl.end()) return it->second;
  return {"DMA.DISPATCH ghostbrain_fallback_" + opcode, "N/A", 30, false};
}

// ── Public API ────────────────────────────────────────────────────────────────

InstrSelection InstructionSelector::select(const GhostOp &op,
                                           GhostTarget target) {
  Instruction instr;
  switch (target) {
  case GhostTarget::CPU:
    instr = selectCpu(op.opcode()); break;
  case GhostTarget::GPU:
    instr = selectGpu(op.opcode()); break;
  case GhostTarget::FPGA:
  case GhostTarget::Chiplet:
    instr = selectChiplet(op.opcode()); break;
  default:
    throw std::invalid_argument("Unknown target");
  }

  return InstrSelection{
      .mnemonic    = instr.mnemonic,
      .encoding    = instr.encoding,
      .latency_cy  = instr.latency_cy,
      .isPipelined = instr.isPipelined,
  };
}

} // namespace ghostbrain::backend
