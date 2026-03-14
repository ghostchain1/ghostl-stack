// GhostBrain — GhostTensor Operations TableGen
// Defines the core tensor operations in the ghosttensor MLIR dialect.

#ifndef GHOSTTENSOR_OPS_TD
#define GHOSTTENSOR_OPS_TD

include "ghosttensor_dialect/dialect.td"
include "mlir/Interfaces/InferTypeOpInterface.td"
include "mlir/Interfaces/SideEffectInterfaces.td"
include "mlir/IR/OpBase.td"

class GhostTensor_Op<string mnemonic, list<Trait> traits = []>
    : Op<GhostTensor_Dialect, mnemonic, traits>;

//===----------------------------------------------------------------------===//
// Matrix Multiply
//===----------------------------------------------------------------------===//

def GhostMatMulOp : GhostTensor_Op<"matmul",
    [Pure, InferTypeOpAdaptor]> {
  let summary     = "General matrix multiplication (GEMM) for GhostBrain tensor cores";
  let description = [{
    Computes C = alpha * A * B + beta * C.
    Maps to tensor-core MAC array on FPGA/chiplet targets.
    On CPU, lowers to BLAS SGEMM / DGEMM via the runtime linker.
  }];

  let arguments = (ins
    AnyTensor:$A,
    AnyTensor:$B,
    Optional<AnyTensor>:$C_init,
    GhostPrecisionAttr:$precision,
    GhostTargetAttr:$target,
    F32Attr:$alpha,
    F32Attr:$beta
  );

  let results = (outs AnyTensor:$result);
}

//===----------------------------------------------------------------------===//
// Sparse Matrix-Vector Multiply
//===----------------------------------------------------------------------===//

def GhostSpMVOp : GhostTensor_Op<"spmv", [Pure]> {
  let summary     = "Sparse matrix-vector multiply targeting sparse core units";
  let description = [{
    Computes y = A * x where A is in CSR format (values, col_indices, row_ptrs).
    On FPGA/chiplet targets, dispatches to the dedicated sparse core (SC) units.
  }];

  let arguments = (ins
    AnyTensor:$values,
    AnyTensor:$col_indices,
    AnyTensor:$row_ptrs,
    AnyTensor:$x,
    GhostPrecisionAttr:$precision
  );

  let results = (outs AnyTensor:$y);
}

//===----------------------------------------------------------------------===//
// Attention
//===----------------------------------------------------------------------===//

def GhostAttentionOp : GhostTensor_Op<"attention", [Pure]> {
  let summary     = "Flash-Attention-2 operator for transformer inference";
  let description = [{
    Computes scaled dot-product attention:
      Attn(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V
    Uses tiled computation to keep memory in L1/L2 SRAM during the inner loop.
    Supports causal masking via the `is_causal` attribute.
  }];

  let arguments = (ins
    AnyTensor:$Q,
    AnyTensor:$K,
    AnyTensor:$V,
    BoolAttr:$is_causal,
    GhostPrecisionAttr:$precision
  );

  let results = (outs AnyTensor:$output, AnyTensor:$softmax_lse);
}

//===----------------------------------------------------------------------===//
// Elementwise ops
//===----------------------------------------------------------------------===//

def GhostAddOp : GhostTensor_Op<"add", [Pure, SameOperandsAndResultType]> {
  let summary   = "Elementwise addition";
  let arguments = (ins AnyTensor:$lhs, AnyTensor:$rhs);
  let results   = (outs AnyTensor:$result);
}

def GhostMulOp : GhostTensor_Op<"mul", [Pure, SameOperandsAndResultType]> {
  let summary   = "Elementwise multiplication";
  let arguments = (ins AnyTensor:$lhs, AnyTensor:$rhs);
  let results   = (outs AnyTensor:$result);
}

def GhostReluOp : GhostTensor_Op<"relu", [Pure, SameOperandsAndResultType]> {
  let summary   = "ReLU activation (elementwise max(0, x))";
  let arguments = (ins AnyTensor:$input);
  let results   = (outs AnyTensor:$output);
}

def GhostSoftmaxOp : GhostTensor_Op<"softmax", [Pure]> {
  let summary   = "Numerically stable softmax along last dimension";
  let arguments = (ins AnyTensor:$input, I64Attr:$axis);
  let results   = (outs AnyTensor:$output);
}

//===----------------------------------------------------------------------===//
// Quantise / Dequantise
//===----------------------------------------------------------------------===//

def GhostQuantiseOp : GhostTensor_Op<"quantise", [Pure]> {
  let summary   = "Quantise FP32/FP16 tensor to INT8/INT4";
  let arguments = (ins
    AnyTensor:$input,
    GhostPrecisionAttr:$target_precision,
    AnyTensor:$scale,
    AnyTensor:$zero_point
  );
  let results = (outs AnyTensor:$output);
}

def GhostDequantiseOp : GhostTensor_Op<"dequantise", [Pure]> {
  let summary   = "Dequantise INT8/INT4 tensor back to FP16/FP32";
  let arguments = (ins
    AnyTensor:$input,
    GhostPrecisionAttr:$source_precision,
    AnyTensor:$scale,
    AnyTensor:$zero_point
  );
  let results = (outs AnyTensor:$output);
}

#endif // GHOSTTENSOR_OPS_TD
