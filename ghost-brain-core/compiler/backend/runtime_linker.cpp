// GhostBrain Compiler — Runtime Linker
// Links compiled GhostIR kernel modules against the GhostBrain runtime library.

#include "backend/runtime_linker.h"
#include <cstdlib>
#include <dlfcn.h>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace ghostbrain::backend {

// ── Symbol Registry ───────────────────────────────────────────────────────────
//
// Maps GhostBrain kernel stub names to resolved function pointers.
// On CPU: loaded from libghostbrain_runtime.so via dlopen.
// On GPU: resolved from the CUDA driver API after cuModuleLoad.
// On chiplet: resolved from the chiplet firmware symbol table (loaded via DMA).

struct ResolvedSymbol {
  void       *fptr;
  std::string libName;
};

static std::unordered_map<std::string, ResolvedSymbol> g_symbolTable;

// ── Library Loading ───────────────────────────────────────────────────────────

static void *g_runtimeLib = nullptr;

static void ensureRuntimeLoaded(const std::string &libPath) {
  if (g_runtimeLib) return;
  g_runtimeLib = dlopen(libPath.c_str(), RTLD_LAZY | RTLD_LOCAL);
  if (!g_runtimeLib) {
    throw std::runtime_error("GhostBrain: failed to load runtime library: " +
                             std::string(dlerror()));
  }
}

// ── Symbol Resolution ─────────────────────────────────────────────────────────

void *RuntimeLinker::resolveSymbol(const std::string &name) {
  auto it = g_symbolTable.find(name);
  if (it != g_symbolTable.end()) return it->second.fptr;

  const char *libPath = std::getenv("GHOSTBRAIN_RUNTIME_LIB");
  if (!libPath) libPath = "/usr/lib/ghostbrain/libghostbrain_runtime.so";

  ensureRuntimeLoaded(libPath);

  void *sym = dlsym(g_runtimeLib, name.c_str());
  if (!sym) {
    throw std::runtime_error("GhostBrain: symbol not found: " + name +
                             " — " + std::string(dlerror()));
  }

  g_symbolTable[name] = {sym, libPath};
  return sym;
}

// ── Kernel Linking ────────────────────────────────────────────────────────────

RuntimeLinker::LinkedModule RuntimeLinker::link(const std::string &generatedCode,
                                                GhostTarget target) {
  LinkedModule mod;
  mod.target = target;

  // Required runtime stubs for each target
  static const std::unordered_map<int, std::vector<std::string>> requiredStubs = {
      {0 /* CPU */,     {"ghostbrain_blas_sgemm_tiled",
                          "ghostbrain_flash_attention_cpu",
                          "ghostbrain_softmax_avx512"}},
      {1 /* GPU */,     {"ghostbrain_cublas_gemm_FP16",
                          "ghostbrain_flash_attn_cuda"}},
      {2 /* FPGA */,    {"ghostbrain_chiplet_dispatch_gemm",
                          "ghostbrain_dma_send_tensor",
                          "ghostbrain_dma_recv_tensor"}},
      {3 /* Chiplet */, {"ghostbrain_chiplet_dispatch_gemm",
                          "ghostbrain_dma_send_tensor",
                          "ghostbrain_dma_recv_tensor"}},
  };

  auto it = requiredStubs.find(static_cast<int>(target));
  if (it != requiredStubs.end()) {
    for (const auto &stub : it->second) {
      try {
        mod.resolvedSymbols[stub] = resolveSymbol(stub);
      } catch (const std::runtime_error &e) {
        // Non-fatal: log and continue; the kernel will fail at runtime if called
        mod.warnings.push_back("Symbol unresolved: " + stub + " — " + e.what());
      }
    }
  }

  mod.code = generatedCode;
  return mod;
}

} // namespace ghostbrain::backend
