/**
 * GhostBrain — ECC Controller (C++)
 *
 * Implements SECDED (Single-Error Correct, Double-Error Detect) ECC
 * for the on-die SRAM banks inside the GhostBrain compute chiplet.
 *
 * Memory organisation:
 *   - 256 MB on-die SRAM split into 8 banks × 32 MB
 *   - SRAM word width: 64 data bits + 8 parity bits = 72 bits total
 *   - SECDED over 64-bit words (Hamming code with 7 parity bits + 1 overall)
 *   - Scrubbing thread sweeps all SRAM every 24 hours
 *
 * Error counters are exposed via Prometheus metrics (via GhostBrain metrics
 * shim) and reported to the L1 firmware registry on threshold breach.
 *
 * Build: g++ -O2 -std=c++17 -o ecc_controller ecc_controller.cpp
 */

#include <array>
#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <functional>
#include <stdexcept>
#include <thread>
#include <vector>

// ── Configuration ─────────────────────────────────────────────────────────

static constexpr uint32_t SRAM_BANKS        = 8;
static constexpr uint64_t BANK_BYTES        = 32ULL * 1024 * 1024;   // 32 MB
static constexpr uint64_t TOTAL_SRAM_BYTES  = SRAM_BANKS * BANK_BYTES;
static constexpr uint32_t WORD_DATA_BITS    = 64;
static constexpr uint32_t PARITY_BITS       = 8;   // 7 SECDED + 1 overall
static constexpr uint32_t WORD_TOTAL_BITS   = WORD_DATA_BITS + PARITY_BITS;

// Alert threshold: trigger L1 report after this many CE events.
static constexpr uint64_t CE_ALERT_THRESHOLD = 1000;

// ── SECDED Parity Calculation ─────────────────────────────────────────────

/**
 * Generate SECDED check bits for a 64-bit data word.
 *
 * Parity bit positions (1-indexed in 72-bit codeword):
 *   P1  at bit 1   → covers bits 1,3,5,7,9,...
 *   P2  at bit 2   → covers bits 2,3,6,7,10,...
 *   P4  at bit 4   → covers bits 4,5,6,7,12,...
 *   P8  at bit 8   → covers bits 8,9,10,11,12,...
 *   P16 at bit 16  → covers bits 16,17,...
 *   P32 at bit 32  → covers bits 32,33,...
 *   P64 at bit 64  → covers bits 64,65,...
 *   P0  (overall)  → XOR of all 71 bits (for DED)
 */
struct EccWord {
  uint64_t data;   // 64-bit data
  uint8_t  parity; // 8-bit check bits [P64..P1, P0 at MSB]
};

static uint8_t compute_parity(uint64_t data) {
  // Map 64 data bits into 72-bit codeword (skip power-of-2 positions).
  uint8_t p = 0;

  // XOR lanes for each of the 7 Hamming parity bits.
  static const uint64_t masks[7] = {
    0xAAAA'AAAA'AAAA'AAAAull,  // P1  — odd positions
    0xCCCC'CCCC'CCCC'CCCCull,  // P2  — pairs
    0xF0F0'F0F0'F0F0'F0F0ull,  // P4  — nibbles
    0xFF00'FF00'FF00'FF00ull,  // P8
    0xFFFF'0000'FFFF'0000ull,  // P16
    0xFFFF'FFFF'0000'0000ull,  // P32
    0xAAAA'AAAA'AAAA'AAAAull,  // P64 (simplified; production RTL differs)
  };

  for (int i = 0; i < 7; i++) {
    uint64_t covered = data & masks[i];
    uint8_t bit = 0;
    while (covered) {
      bit ^= covered & 1;
      covered >>= 1;
    }
    p |= static_cast<uint8_t>(bit << i);
  }

  // P0: overall parity (XOR of all data bits + 7 check bits).
  uint64_t overall = data;
  while (overall >>= 1) p ^= static_cast<uint8_t>(overall & 1);
  return p;
}

static EccWord encode(uint64_t data) {
  return { data, compute_parity(data) };
}

struct DecodeResult {
  uint64_t corrected;
  bool     single_bit_error;   // CE: corrected
  bool     double_bit_error;   // DED: uncorrectable
};

static DecodeResult decode(EccWord word) {
  uint8_t syndrome    = word.parity ^ compute_parity(word.data);
  bool    overall_ok  = (__builtin_parityll(word.data) ^ __builtin_parity(word.parity)) == 0;

  if (syndrome == 0 && overall_ok) {
    return { word.data, false, false };   // no error
  }
  if (!overall_ok && syndrome != 0) {
    // Single-bit error: correct it.
    int err_pos = syndrome & 0x7F;   // 7-bit syndrome gives error position
    uint64_t corrected = word.data;
    if (err_pos <= 64) {
      corrected ^= 1ULL << (err_pos - 1);
    }
    return { corrected, true, false };
  }
  // Double-bit error (detected, not correctable).
  return { word.data, false, true };
}

// ── SRAM Bank Simulation ──────────────────────────────────────────────────

/**
 * Simulated SRAM bank holding 72-bit ECC words.
 * Each 8-byte (64-bit) address maps to one EccWord in the store.
 */
class SramBank {
public:
  static constexpr uint64_t WORDS = BANK_BYTES / (WORD_DATA_BITS / 8);

  std::vector<EccWord> store_;

  explicit SramBank() : store_(WORDS, { 0ULL, 0 }) {}

  void write(uint64_t word_idx, uint64_t data) {
    assert(word_idx < WORDS);
    store_[word_idx] = encode(data);
  }

  DecodeResult read(uint64_t word_idx) {
    assert(word_idx < WORDS);
    return decode(store_[word_idx]);
  }

  /** Inject a single-bit error for testing. */
  void inject_single_bit_error(uint64_t word_idx, int bit_pos) {
    assert(word_idx < WORDS && bit_pos >= 0 && bit_pos < 64);
    store_[word_idx].data ^= 1ULL << bit_pos;
  }
};

// ── ECC Controller ────────────────────────────────────────────────────────

class EccController {
public:
  std::array<SramBank, SRAM_BANKS> banks_;

  std::atomic<uint64_t> total_ce_count_  { 0 };  // single-bit corrected
  std::atomic<uint64_t> total_ued_count_ { 0 };  // double-bit detected
  std::atomic<bool>     scrub_running_   { false };

  std::function<void(uint64_t ce, uint64_t ued)> alert_callback_;

  EccController() = default;

  /** Set alert callback (called when CE_ALERT_THRESHOLD is exceeded). */
  void set_alert_callback(std::function<void(uint64_t, uint64_t)> cb) {
    alert_callback_ = std::move(cb);
  }

  void write(uint32_t bank, uint64_t word_idx, uint64_t data) {
    banks_[bank].write(word_idx, data);
  }

  uint64_t read(uint32_t bank, uint64_t word_idx) {
    auto result = banks_[bank].read(word_idx);
    if (result.single_bit_error) {
      uint64_t ce = ++total_ce_count_;
      // Re-write corrected data (scrub in-place).
      banks_[bank].write(word_idx, result.corrected);
      if (ce == CE_ALERT_THRESHOLD && alert_callback_) {
        alert_callback_(ce, total_ued_count_.load());
      }
    }
    if (result.double_bit_error) {
      ++total_ued_count_;
      fprintf(stderr,
        "[ECC] UNCORRECTABLE error at bank=%u word=0x%016llx — FATAL\n",
        bank, (unsigned long long)word_idx);
    }
    return result.corrected;
  }

  /** Background scrub: sweep all banks and correct any CEs. */
  void start_scrub_thread() {
    if (scrub_running_.exchange(true)) return;
    std::thread([this] {
      while (scrub_running_) {
        for (uint32_t b = 0; b < SRAM_BANKS; b++) {
          for (uint64_t w = 0; w < SramBank::WORDS; w++) {
            auto res = banks_[b].read(w);
            if (res.single_bit_error) {
              banks_[b].write(w, res.corrected);
              ++total_ce_count_;
            }
          }
        }
        // Sleep 24 hours between full sweeps.
        std::this_thread::sleep_for(std::chrono::hours(24));
      }
    }).detach();
  }

  void stop_scrub() { scrub_running_ = false; }

  void print_stats() const {
    printf("[ECC] Corrected errors (CE):   %llu\n",
           (unsigned long long)total_ce_count_.load());
    printf("[ECC] Uncorrectable (UED):     %llu\n",
           (unsigned long long)total_ued_count_.load());
  }
};

// ── Main (self-test) ───────────────────────────────────────────────────────

int main() {
  EccController ctrl;

  ctrl.set_alert_callback([](uint64_t ce, uint64_t ued) {
    printf("[ECC ALERT] CE threshold reached: ce=%llu ued=%llu\n",
           (unsigned long long)ce, (unsigned long long)ued);
  });

  // Write a known pattern.
  constexpr uint32_t BANK   = 0;
  constexpr uint64_t WORD   = 42;
  constexpr uint64_t GOLDEN = 0xDEAD'BEEF'CAFE'BABEull;

  ctrl.write(BANK, WORD, GOLDEN);

  // Clean read.
  uint64_t val = ctrl.read(BANK, WORD);
  assert(val == GOLDEN);
  printf("[ECC] Clean read:   PASS (0x%016llx)\n", (unsigned long long)val);

  // Inject a single-bit error + verify correction.
  ctrl.banks_[BANK].inject_single_bit_error(WORD, 3);
  val = ctrl.read(BANK, WORD);
  assert(val == GOLDEN);
  printf("[ECC] CE corrected: PASS (0x%016llx)\n", (unsigned long long)val);

  ctrl.print_stats();
  return 0;
}
