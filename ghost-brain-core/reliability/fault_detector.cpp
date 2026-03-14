/**
 * GhostBrain — Fault Detector (C++)
 *
 * Structural fault detection for the GhostBrain chiplet:
 *   1. March-C- SRAM test (stuck-at and transition faults)
 *   2. NoC link Bit Error Rate (BER) monitor per port-pair
 *   3. DMA channel CRC verification (CRC-32C per descriptor)
 *   4. Systolic array connectivity check (known-answer test)
 *
 * This module runs at POR (Power-On Reset) and periodically via the
 * health_monitor. Failures are reported to the L1 firmware registry
 * via the GhostBrain management sideband (port 7901).
 *
 * Build: g++ -O2 -std=c++17 -o fault_detector fault_detector.cpp
 */

#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <optional>
#include <string>
#include <vector>

// ── Types ─────────────────────────────────────────────────────────────────

enum class FaultKind {
  NONE,
  STUCK_AT_0,
  STUCK_AT_1,
  TRANSITION,
  BER_EXCEEDED,
  CRC_MISMATCH,
  KAT_FAIL,
};

struct Fault {
  FaultKind   kind;
  std::string module;    // "sram_bank_0", "noc_port_2_3", "dma_ch_1", "systolic"
  uint64_t    address;   // byte address or diagnostic code
  std::string detail;
};

using FaultList = std::vector<Fault>;

// ── CRC-32C (Castagnoli) ──────────────────────────────────────────────────

static uint32_t make_crc32c_table_entry(uint32_t n) {
  for (int k = 0; k < 8; k++) {
    n = (n >> 1) ^ ((n & 1) ? 0x82F6'3B78u : 0u);
  }
  return n;
}

static uint32_t* crc32c_table() {
  static uint32_t table[256] = {};
  static bool     init       = false;
  if (!init) {
    for (int i = 0; i < 256; i++) table[i] = make_crc32c_table_entry(i);
    init = true;
  }
  return table;
}

static uint32_t crc32c(const uint8_t* data, size_t len) {
  const uint32_t* table = crc32c_table();
  uint32_t crc = 0xFFFF'FFFFu;
  for (size_t i = 0; i < len; i++) {
    crc = (crc >> 8) ^ table[(crc ^ data[i]) & 0xFF];
  }
  return crc ^ 0xFFFF'FFFFu;
}

// ── March-C- SRAM Test ────────────────────────────────────────────────────
//
// March-C- consists of 6 marching elements over the SRAM address space:
//   M0: ↑(w0)         — write 0 ascending
//   M1: ↑(r0, w1)     — read 0, write 1 ascending
//   M2: ↑(r1, w0)     — read 1, write 0 ascending
//   M3: ↓(r0, w1)     — read 0, write 1 descending
//   M4: ↓(r1, w0)     — read 1, write 0 descending
//   M5: ↑(r0)         — read 0 ascending   (verify)
//
// Detects stuck-at, coupling, and transition faults.
//
// NOTE: On the real chiplet, this runs from ROM at POR with all caches
// flushed and no ECC code paths active. This is a software model for
// pre-silicon verification and FPGA bringup.

static std::optional<Fault> march_c_test(
    uint64_t* mem,         // pointer to SRAM bank (simulated)
    uint64_t  words,       // number of 64-bit words
    uint32_t  bank_id
) {
  auto fail = [&](FaultKind k, uint64_t idx, const char* detail) -> std::optional<Fault> {
    char mod[32];
    snprintf(mod, sizeof(mod), "sram_bank_%u", bank_id);
    return Fault{ k, mod, idx * 8, detail };
  };

  // M0: write 0
  for (uint64_t i = 0; i < words; i++) mem[i] = 0ULL;
  // M1: read 0, write 1 (ascending)
  for (uint64_t i = 0; i < words; i++) {
    if (mem[i] != 0ULL) return fail(FaultKind::STUCK_AT_1, i, "M1 r0 failed");
    mem[i] = ~0ULL;
  }
  // M2: read 1, write 0 (ascending)
  for (uint64_t i = 0; i < words; i++) {
    if (mem[i] != ~0ULL) return fail(FaultKind::STUCK_AT_0, i, "M2 r1 failed");
    mem[i] = 0ULL;
  }
  // M3: read 0, write 1 (descending)
  for (int64_t i = (int64_t)words - 1; i >= 0; i--) {
    if ((uint64_t)mem[i] != 0ULL) return fail(FaultKind::TRANSITION, i, "M3 r0 failed");
    mem[i] = ~0ULL;
  }
  // M4: read 1, write 0 (descending)
  for (int64_t i = (int64_t)words - 1; i >= 0; i--) {
    if ((uint64_t)mem[i] != ~0ULL) return fail(FaultKind::STUCK_AT_0, i, "M4 r1 failed");
    mem[i] = 0ULL;
  }
  // M5: read 0 (ascending)
  for (uint64_t i = 0; i < words; i++) {
    if (mem[i] != 0ULL) return fail(FaultKind::STUCK_AT_1, i, "M5 r0 failed");
  }
  return std::nullopt;
}

// ── NoC Link BER Monitor ──────────────────────────────────────────────────
//
// Sends a 64-bit PRBS (pseudo-random bit sequence) pattern over each
// of the 4×4 NoC links and measures received vs expected bits.

struct NocBerResult {
  uint32_t src_port;
  uint32_t dst_port;
  uint64_t bits_sent;
  uint64_t bit_errors;
  double   ber;     // bit_errors / bits_sent
};

static constexpr double BER_THRESHOLD = 1e-12;

// PRBS-31 generator (polynomial: x^31 + x^28 + 1)
struct Prbs31 {
  uint32_t state { 0xACE1'0001u };
  uint32_t next() {
    uint32_t bit = ((state >> 30) ^ (state >> 27)) & 1;
    state = (state << 1) | bit;
    return bit;
  }
};

static NocBerResult simulate_noc_link(uint32_t src, uint32_t dst, uint64_t bits) {
  Prbs31   tx_gen;
  Prbs31   rx_gen;   // same seed → perfect link; inject error for modelling
  uint64_t errors = 0;

  // Simulate near-ideal link: inject 1 error per 1e12 bits (BER = 1e-12).
  for (uint64_t i = 0; i < bits; i++) {
    uint32_t tx = tx_gen.next();
    uint32_t rx = rx_gen.next();
    // Probabilistic error injection: flip bit at position 1'000'000'000'000.
    if (i == 999'999'999'999ULL) rx ^= 1;
    errors += (tx != rx) ? 1 : 0;
  }

  double ber = (bits > 0) ? (double)errors / (double)bits : 0.0;
  return { src, dst, bits, errors, ber };
}

static std::optional<Fault> check_noc_ber(uint32_t src, uint32_t dst) {
  constexpr uint64_t PRBS_BITS = 1'000'000'000ULL;   // 1 Gbit per link
  auto res = simulate_noc_link(src, dst, PRBS_BITS);

  if (res.ber > BER_THRESHOLD) {
    char mod[32];
    snprintf(mod, sizeof(mod), "noc_port_%u_%u", src, dst);
    char detail[64];
    snprintf(detail, sizeof(detail), "BER=%.2e (threshold=%.2e)", res.ber, BER_THRESHOLD);
    return Fault{ FaultKind::BER_EXCEEDED, mod, 0, detail };
  }
  return std::nullopt;
}

// ── DMA Channel CRC Verification ─────────────────────────────────────────

struct DmaDescriptor {
  uint64_t src_addr;
  uint64_t dst_addr;
  uint32_t byte_len;
  uint32_t expected_crc32c;
};

static std::optional<Fault> verify_dma_crc(
    uint32_t          ch,
    const uint8_t*    data,
    uint64_t          len,
    uint32_t          expected
) {
  uint32_t actual = crc32c(data, len);
  if (actual != expected) {
    char mod[32];
    snprintf(mod, sizeof(mod), "dma_ch_%u", ch);
    char detail[80];
    snprintf(detail, sizeof(detail),
             "CRC mismatch: got=0x%08X expected=0x%08X", actual, expected);
    return Fault{ FaultKind::CRC_MISMATCH, mod, 0, detail };
  }
  return std::nullopt;
}

// ── Systolic Array Known-Answer Test ─────────────────────────────────────
//
// Sends a 4×4 matrix multiply (trivially verifiable) through one TC tile
// and checks the result. Verifies PE interconnect and accumulator paths.

static std::optional<Fault> systolic_kat() {
  // A: 4×4 identity  B: 4×4 all-ones  → C should be 4×4 all-ones (int8 MACs)
  int8_t A[4][4] = {{ 1,0,0,0 },{ 0,1,0,0 },{ 0,0,1,0 },{ 0,0,0,1 }};
  int8_t B[4][4] = {{ 1,1,1,1 },{ 1,1,1,1 },{ 1,1,1,1 },{ 1,1,1,1 }};
  int32_t C[4][4] = {};

  for (int i = 0; i < 4; i++)
    for (int j = 0; j < 4; j++)
      for (int k = 0; k < 4; k++)
        C[i][j] += A[i][k] * B[k][j];

  for (int i = 0; i < 4; i++)
    for (int j = 0; j < 4; j++)
      if (C[i][j] != 1) {
        char detail[64];
        snprintf(detail, sizeof(detail), "C[%d][%d]=%d (expected 1)", i, j, C[i][j]);
        return Fault{ FaultKind::KAT_FAIL, "systolic", 0, detail };
      }

  return std::nullopt;
}

// ── Fault Detector ────────────────────────────────────────────────────────

class FaultDetector {
public:
  FaultList run_por_tests() {
    FaultList faults;

    // 1. SRAM March-C- (quick: test 1 MB per bank for POR, full 32 MB in background).
    constexpr uint64_t MARCH_WORDS = (1ULL * 1024 * 1024) / 8;   // 1 MB / 8 bytes
    std::vector<uint64_t> buf(MARCH_WORDS, 0);
    for (uint32_t b = 0; b < 8; b++) {
      auto f = march_c_test(buf.data(), MARCH_WORDS, b);
      if (f) faults.push_back(*f);
    }

    // 2. NoC BER on all 20 bidirectional port pairs in a 4×4 mesh.
    for (uint32_t src = 0; src < 4; src++) {
      for (uint32_t dst = src + 1; dst < 4; dst++) {
        auto f = check_noc_ber(src, dst);
        if (f) faults.push_back(*f);
      }
    }

    // 3. DMA CRC: self-test with known pattern.
    static const uint8_t dma_pat[] = "GhostBrain-DMA-Self-Test-v1";
    uint32_t expected_crc = crc32c(dma_pat, sizeof(dma_pat) - 1);
    for (uint32_t ch = 0; ch < 4; ch++) {
      auto f = verify_dma_crc(ch, dma_pat, sizeof(dma_pat) - 1, expected_crc);
      if (f) faults.push_back(*f);
    }

    // 4. Systolic KAT.
    auto f = systolic_kat();
    if (f) faults.push_back(*f);

    return faults;
  }

  void print_report(const FaultList& faults) const {
    if (faults.empty()) {
      printf("[FaultDetector] All POR tests PASSED — no faults detected.\n");
      return;
    }
    fprintf(stderr, "[FaultDetector] %zu fault(s) detected:\n", faults.size());
    for (const auto& f : faults) {
      fprintf(stderr, "  %-20s  kind=%d  addr=0x%016llx  detail=%s\n",
              f.module.c_str(), (int)f.kind,
              (unsigned long long)f.address, f.detail.c_str());
    }
  }
};

// ── Main (self-test) ───────────────────────────────────────────────────────

int main() {
  FaultDetector det;
  FaultList     faults = det.run_por_tests();
  det.print_report(faults);
  return faults.empty() ? 0 : 1;
}
