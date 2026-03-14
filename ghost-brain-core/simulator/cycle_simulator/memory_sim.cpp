// GhostBrain — Memory Hierarchy Simulator
// Models HBM3, L2 SRAM, and L1 SRAM with accurate bandwidth + latency.

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <unordered_map>
#include <vector>

// ── Memory Level Parameters ───────────────────────────────────────────────────

struct MemLevel {
  const char*  name;
  size_t       capacity_bytes;
  double       bandwidth_GBps;
  uint64_t     latency_cycles;
};

static constexpr MemLevel L1_SRAM   = {"L1_SRAM",   4ULL * 1024 * 1024,      2000.0,   2};
static constexpr MemLevel L2_SRAM   = {"L2_SRAM",  64ULL * 1024 * 1024,       800.0,   8};
static constexpr MemLevel HBM3      = {"HBM3",      96ULL * 1024 * 1024 * 1024, 3600.0, 100};
static constexpr MemLevel HOST_DRAM = {"HOST_DRAM", 512ULL* 1024 * 1024 * 1024,  64.0, 400};

// ── Cache Entry ───────────────────────────────────────────────────────────────

struct CacheLine {
  uint64_t tag;
  bool     valid  = false;
  bool     dirty  = false;
  uint64_t lru_tick = 0;
};

// ── Simple Set-Associative Cache ──────────────────────────────────────────────

class Cache {
public:
  Cache(const MemLevel& level, int assoc, int line_bytes)
      : level_(level), assoc_(assoc), line_bytes_(line_bytes) {
    set_count_ = static_cast<int>(level.capacity_bytes / (assoc * line_bytes));
    lines_.resize(static_cast<size_t>(set_count_ * assoc));
  }

  // Returns true on hit, false on miss.  Updates LRU on access.
  bool access(uint64_t addr, bool is_write) {
    uint64_t tag = addr / line_bytes_;
    int      set = static_cast<int>(tag % set_count_);

    ++tick_;
    for (int w = 0; w < assoc_; ++w) {
      auto& line = lines_[static_cast<size_t>(set * assoc_ + w)];
      if (line.valid && line.tag == tag) {
        line.lru_tick = tick_;
        if (is_write) line.dirty = true;
        ++hits_;
        return true;
      }
    }

    // Miss — evict LRU way
    ++misses_;
    int lru_way   = 0;
    uint64_t lru_t = UINT64_MAX;
    for (int w = 0; w < assoc_; ++w) {
      auto& line = lines_[static_cast<size_t>(set * assoc_ + w)];
      if (!line.valid || line.lru_tick < lru_t) {
        lru_way = w;
        lru_t   = line.lru_tick;
      }
    }
    auto& victim  = lines_[static_cast<size_t>(set * assoc_ + lru_way)];
    if (victim.valid && victim.dirty) ++writebacks_;
    victim = {tag, true, is_write, tick_};
    return false;
  }

  struct Stats {
    uint64_t hits, misses, writebacks;
    double   hit_rate;
  };

  Stats stats() const {
    uint64_t total = hits_ + misses_;
    return {hits_, misses_, writebacks_,
            total > 0 ? static_cast<double>(hits_) / total : 0.0};
  }

private:
  MemLevel level_;
  int      assoc_, line_bytes_, set_count_;
  uint64_t tick_        = 0;
  uint64_t hits_        = 0;
  uint64_t misses_      = 0;
  uint64_t writebacks_  = 0;
  std::vector<CacheLine> lines_;
};

// ── Memory Subsystem ──────────────────────────────────────────────────────────

struct MemorySubsystem {
  Cache l1;
  Cache l2;
  uint64_t l1_cycles    = 0;
  uint64_t l2_cycles    = 0;
  uint64_t hbm_cycles   = 0;
  uint64_t dram_cycles  = 0;

  MemorySubsystem()
      : l1(L1_SRAM, 8, 64), l2(L2_SRAM, 16, 64) {}

  uint64_t access(uint64_t addr, size_t bytes, bool is_write) {
    if (l1.access(addr, is_write)) {
      l1_cycles += L1_SRAM.latency_cycles;
      return L1_SRAM.latency_cycles;
    }
    if (l2.access(addr, is_write)) {
      l2_cycles += L2_SRAM.latency_cycles;
      return L2_SRAM.latency_cycles;
    }
    if (bytes <= HBM3.capacity_bytes) {
      hbm_cycles += HBM3.latency_cycles;
      return HBM3.latency_cycles;
    }
    dram_cycles += HOST_DRAM.latency_cycles;
    return HOST_DRAM.latency_cycles;
  }
};
