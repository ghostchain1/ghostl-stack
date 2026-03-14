// GhostBrain Compiler — Backend Code Generator
// Emits target-specific kernel code from GhostIR tiled/fused ops.

#include "backend/ghost_codegen.h"
#include "ghosttensor_dialect/ghost_ir.h"
#include <sstream>
#include <stdexcept>
#include <unordered_map>

namespace ghostbrain::backend {

// ── Emission Context ──────────────────────────────────────────────────────────

struct EmitContext {
  std::ostringstream  out;
  GhostTarget         target;
  int                 indentLevel = 0;

  void indent()   { ++indentLevel; }
  void dedent()   { if (indentLevel > 0) --indentLevel; }
  std::string pad() const { return std::string(indentLevel * 2, ' '); }
  void line(const std::string &s) { out << pad() << s << '\n'; }
};

// ── CPU Backend ───────────────────────────────────────────────────────────────

static void emitCpuMatMul(EmitContext &ctx, const GhostOp *op) {
  auto &attrs = op->attrs();
  std::string tm = attrs.count("tile_m") ? attrs.at("tile_m") : "64";
  std::string tn = attrs.count("tile_n") ? attrs.at("tile_n") : "64";
  std::string tk = attrs.count("tile_k") ? attrs.at("tile_k") : "64";

  ctx.line("// GhostBrain CPU matmul — tiled " + tm + "x" + tn + "x" + tk);
  ctx.line("ghostbrain_blas_sgemm_tiled(A, B, C, M, N, K, " + tm + ", " + tn + ", " + tk + ");");
}

static void emitCpuAttention(EmitContext &ctx, const GhostOp *) {
  ctx.line("// GhostBrain CPU Flash-Attention-2");
  ctx.line("ghostbrain_flash_attention_cpu(Q, K, V, out, seq_len, num_heads, head_dim, is_causal);");
}

// ── GPU Backend ───────────────────────────────────────────────────────────────

static void emitGpuMatMul(EmitContext &ctx, const GhostOp *op) {
  auto &attrs = op->attrs();
  std::string prec = attrs.count("precision") ? attrs.at("precision") : "FP16";
  ctx.line("// GhostBrain GPU GEMM — precision=" + prec);
  ctx.line("ghostbrain_cublas_gemm_" + prec + "(handle, A, B, C, M, N, K, alpha, beta);");
}

// ── FPGA / Chiplet Backend ────────────────────────────────────────────────────

static void emitChipletMatMul(EmitContext &ctx, const GhostOp *op) {
  auto &attrs = op->attrs();
  std::string prec   = attrs.count("precision")   ? attrs.at("precision")   : "INT8";
  std::string sparse = attrs.count("sparse")      ? attrs.at("sparse")      : "none";
  std::string tm     = attrs.count("tile_m")      ? attrs.at("tile_m")      : "128";

  ctx.line("// GhostBrain chiplet matmul — tile=" + tm + " prec=" + prec + " sparse=" + sparse);
  ctx.line("ghostbrain_dma_send_tensor(A_buf, A, M * K);");
  ctx.line("ghostbrain_dma_send_tensor(B_buf, B, K * N);");
  ctx.line("ghostbrain_chiplet_dispatch_gemm(A_buf, B_buf, C_buf, M, N, K, prec_" + prec + ", " + tm + ");");
  ctx.line("ghostbrain_dma_recv_tensor(C, C_buf, M * N);");
}

// ── Dispatch Table ────────────────────────────────────────────────────────────

static void emitOp(EmitContext &ctx, const GhostOp *op) {
  const std::string &code = op->opcode();

  if (code == "matmul" || code == "matmul_tiled" || code == "matmul_int") {
    switch (ctx.target) {
    case GhostTarget::CPU:     emitCpuMatMul(ctx, op);     break;
    case GhostTarget::GPU:     emitGpuMatMul(ctx, op);     break;
    case GhostTarget::FPGA:
    case GhostTarget::Chiplet: emitChipletMatMul(ctx, op); break;
    }
  } else if (code == "attention") {
    if (ctx.target == GhostTarget::CPU)
      emitCpuAttention(ctx, op);
    else
      ctx.line("ghostbrain_flash_attention_gpu(Q, K, V, out, seq_len, num_heads, head_dim, is_causal);");
  } else {
    ctx.line("ghostbrain_elementwise_" + code + "(operands, results);");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

std::string GhostCodegen::emit(const GhostModule &mod, GhostTarget target) {
  EmitContext ctx;
  ctx.target = target;

  ctx.line("// GhostBrain Generated Kernel — target=" +
           std::to_string(static_cast<int>(target)));
  ctx.line("#include \"ghostbrain_runtime_api.h\"");

  for (const auto &fn : mod.functions()) {
    ctx.line("\nvoid ghostbrain_kernel_" + fn->name() + "(GhostRuntimeCtx *ctx) {");
    ctx.indent();
    for (const auto &blk : fn->blocks()) {
      for (const auto &op : blk->ops()) {
        emitOp(ctx, op.get());
      }
    }
    ctx.dedent();
    ctx.line("}");
  }

  return ctx.out.str();
}

} // namespace ghostbrain::backend
