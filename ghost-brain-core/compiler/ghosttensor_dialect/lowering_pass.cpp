// GhostBrain — GhostTensor Lowering Pass
// Lowers ghosttensor dialect ops to LLVM / SPIR-V / FPGA backend dialects.

#include "ghosttensor_dialect/lowering_pass.h"
#include "mlir/Conversion/LLVMCommon/ConversionTarget.h"
#include "mlir/Dialect/Func/IR/FuncOps.h"
#include "mlir/Dialect/LLVMIR/LLVMDialect.h"
#include "mlir/IR/PatternMatch.h"
#include "mlir/Transforms/DialectConversion.h"

using namespace mlir;
using namespace ghostbrain::ghosttensor;

// ── MatMul Lowering ────────────────────────────────────────────────────────────

struct GhostMatMulLowering : public OpRewritePattern<GhostMatMulOp> {
  using OpRewritePattern<GhostMatMulOp>::OpRewritePattern;

  LogicalResult matchAndRewrite(GhostMatMulOp op,
                                PatternRewriter &rewriter) const override {
    Location loc = op.getLoc();
    auto target  = op.getTarget();

    switch (target) {
    case GhostTarget::CPU:
      // Lower to external BLAS sgemm call
      rewriter.replaceOpWithNewOp<LLVM::CallOp>(
          op, TypeRange{op.getResult().getType()},
          rewriter.getStringAttr("ghostbrain_blas_sgemm"),
          ValueRange{op.getA(), op.getB()});
      return success();

    case GhostTarget::GPU:
      // Lower to cuBLAS / rocBLAS via runtime dispatch table
      rewriter.replaceOpWithNewOp<LLVM::CallOp>(
          op, TypeRange{op.getResult().getType()},
          rewriter.getStringAttr("ghostbrain_cublas_gemm"),
          ValueRange{op.getA(), op.getB()});
      return success();

    case GhostTarget::FPGA:
    case GhostTarget::Chiplet:
      // Lower to GhostBrain chiplet dispatch via DMA descriptor
      rewriter.replaceOpWithNewOp<LLVM::CallOp>(
          op, TypeRange{op.getResult().getType()},
          rewriter.getStringAttr("ghostbrain_chiplet_gemm"),
          ValueRange{op.getA(), op.getB()});
      return success();
    }
    return failure();
  }
};

// ── Attention Lowering ─────────────────────────────────────────────────────────

struct GhostAttentionLowering : public OpRewritePattern<GhostAttentionOp> {
  using OpRewritePattern<GhostAttentionOp>::OpRewritePattern;

  LogicalResult matchAndRewrite(GhostAttentionOp op,
                                PatternRewriter &rewriter) const override {
    // Always lower to tiled flash-attention kernel regardless of target;
    // the runtime linker selects the backend implementation.
    rewriter.replaceOpWithNewOp<LLVM::CallOp>(
        op,
        TypeRange{op.getOutput().getType(), op.getSoftmaxLse().getType()},
        rewriter.getStringAttr("ghostbrain_flash_attention"),
        ValueRange{op.getQ(), op.getK(), op.getV()});
    return success();
  }
};

// ── Pass Registration ──────────────────────────────────────────────────────────

struct GhostTensorLoweringPass
    : public PassWrapper<GhostTensorLoweringPass, OperationPass<ModuleOp>> {
  MLIR_DEFINE_EXPLICIT_INTERNAL_INLINE_TYPE_ID(GhostTensorLoweringPass)
  void getDependentDialects(DialectRegistry &registry) const override {
    registry.insert<LLVM::LLVMDialect>();
    registry.insert<func::FuncDialect>();
  }

  void runOnOperation() override {
    MLIRContext *ctx = &getContext();
    RewritePatternSet patterns(ctx);
    patterns.add<GhostMatMulLowering, GhostAttentionLowering>(ctx);

    ConversionTarget target(*ctx);
    target.addLegalDialect<LLVM::LLVMDialect>();
    target.addIllegalDialect<GhostTensor_Dialect>();

    if (failed(applyPartialConversion(getOperation(), target,
                                      std::move(patterns))))
      signalPassFailure();
  }
};

std::unique_ptr<Pass> ghostbrain::ghosttensor::createGhostTensorLoweringPass() {
  return std::make_unique<GhostTensorLoweringPass>();
}
