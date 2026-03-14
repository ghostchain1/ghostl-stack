// GhostBrain — GhostTensor MLIR Dialect Definition
// TableGen spec for the ghosttensor dialect.

#ifndef GHOSTTENSOR_DIALECT_TD
#define GHOSTTENSOR_DIALECT_TD

include "mlir/IR/DialectBase.td"
include "mlir/IR/AttrTypeBase.td"

//===----------------------------------------------------------------------===//
// GhostTensor Dialect
//===----------------------------------------------------------------------===//

def GhostTensor_Dialect : Dialect {
  let name        = "ghosttensor";
  let summary     = "GhostBrain tensor compute dialect";
  let description = [{
    The GhostTensor dialect provides operations for expressing tensor computations
    that target the GhostBrain hardware stack (CPU, GPU, FPGA, and custom chiplet).

    Operations are structured to expose tile-level parallelism for the NoC scheduler,
    sparsity structure for the sparse core units, and precision annotations for the
    quantisation pass.
  }];

  let cppNamespace       = "::ghostbrain::ghosttensor";
  let useDefaultTypePrinterParser = 1;
  let useDefaultAttributePrinterParser = 1;
}

//===----------------------------------------------------------------------===//
// Base class for GhostTensor types
//===----------------------------------------------------------------------===//

class GhostTensor_Type<string name, string typeMnemonic>
    : TypeDef<GhostTensor_Dialect, name> {
  let mnemonic = typeMnemonic;
}

//===----------------------------------------------------------------------===//
// Precision Enum
//===----------------------------------------------------------------------===//

def GhostPrecision_FP32  : I32EnumAttrCase<"FP32",  0>;
def GhostPrecision_FP16  : I32EnumAttrCase<"FP16",  1>;
def GhostPrecision_BF16  : I32EnumAttrCase<"BF16",  2>;
def GhostPrecision_INT8  : I32EnumAttrCase<"INT8",  3>;
def GhostPrecision_INT4  : I32EnumAttrCase<"INT4",  4>;

def GhostPrecisionAttr : I32EnumAttr<
    "GhostPrecision", "GhostBrain compute precision",
    [GhostPrecision_FP32, GhostPrecision_FP16, GhostPrecision_BF16,
     GhostPrecision_INT8, GhostPrecision_INT4]> {
  let cppNamespace = "::ghostbrain::ghosttensor";
}

//===----------------------------------------------------------------------===//
// Target Enum
//===----------------------------------------------------------------------===//

def GhostTarget_CPU     : I32EnumAttrCase<"CPU",     0>;
def GhostTarget_GPU     : I32EnumAttrCase<"GPU",     1>;
def GhostTarget_FPGA    : I32EnumAttrCase<"FPGA",    2>;
def GhostTarget_Chiplet : I32EnumAttrCase<"Chiplet", 3>;

def GhostTargetAttr : I32EnumAttr<
    "GhostTarget", "GhostBrain execution target",
    [GhostTarget_CPU, GhostTarget_GPU, GhostTarget_FPGA, GhostTarget_Chiplet]> {
  let cppNamespace = "::ghostbrain::ghosttensor";
}

#endif // GHOSTTENSOR_DIALECT_TD
