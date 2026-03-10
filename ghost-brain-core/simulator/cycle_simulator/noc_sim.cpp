// GhostBrain — NoC Cycle-Accurate Simulator
// Models the 4×4 mesh NoC with wormhole routing, credit-based flow control,
// and 8 virtual channels per link.  Used by the benchmark harness to predict
// communication bottlenecks before hardware tape-out.

#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
#include <deque>
#include <iostream>
#include <unordered_map>
#include <vector>

// ── NoC Parameters ────────────────────────────────────────────────────────────

static constexpr int NOC_ROWS      = 4;
static constexpr int NOC_COLS      = 4;
static constexpr int NOC_NODES     = NOC_ROWS * NOC_COLS;  // 16
static constexpr int NOC_VCS       = 8;
static constexpr int NOC_CREDITS   = 4;
static constexpr int NOC_LINK_BITS = 512;  // bits per link per direction
static constexpr int NOC_FREQ_GHZ  = 4;
static constexpr int HOP_LATENCY   = 2;    // cycles per hop (base)

// ── Packet ────────────────────────────────────────────────────────────────────

struct NoCPacket {
  int     src_x, src_y;
  int     dst_x, dst_y;
  int     vc;           // virtual channel 0–7
  int     payload_bytes;
  int     packet_id;
  uint64_t injected_cycle;
};

// ── Router State ──────────────────────────────────────────────────────────────

struct RouterState {
  // Ingress queues per VC per direction (N/S/E/W/Local)
  std::array<std::array<std::deque<NoCPacket>, NOC_VCS>, 5> ingress;
  // Credit counters per (VC, direction)
  std::array<std::array<int, NOC_VCS>, 4> credits;

  RouterState() {
    for (auto& vc_arr : credits)
      vc_arr.fill(NOC_CREDITS);
  }
};

// ── Simulation State ──────────────────────────────────────────────────────────

struct NoCSimState {
  std::array<RouterState, NOC_NODES> routers;
  uint64_t   cycle = 0;
  // Per-link utilisation counters
  uint64_t   link_flits_n[NOC_NODES] = {};
  uint64_t   link_flits_s[NOC_NODES] = {};
  uint64_t   link_flits_e[NOC_NODES] = {};
  uint64_t   link_flits_w[NOC_NODES] = {};
  uint64_t   total_packets  = 0;
  uint64_t   total_latency_cycles = 0;
  std::vector<uint64_t> per_packet_latency;
};

// ── XY Routing ────────────────────────────────────────────────────────────────

// Returns the next-hop direction for XY routing (0=N,1=S,2=E,3=W,4=Local)
static int xy_next_dir(int cur_x, int cur_y, int dst_x, int dst_y) {
  if      (cur_x < dst_x) return 2; // East
  else if (cur_x > dst_x) return 3; // West
  else if (cur_y < dst_y) return 1; // South
  else if (cur_y > dst_y) return 0; // North
  else                    return 4; // Local
}

// ── Inject Packet ─────────────────────────────────────────────────────────────

void noc_inject(NoCSimState& sim, NoCPacket pkt) {
  int node = pkt.src_y * NOC_COLS + pkt.src_x;
  pkt.injected_cycle = sim.cycle;
  sim.routers[node].ingress[4][pkt.vc].push_back(pkt);
  sim.total_packets++;
}

// ── Step One Cycle ─────────────────────────────────────────────────────────────

void noc_step(NoCSimState& sim) {
  // Process each router: consume one flit per active VC per direction
  for (int y = 0; y < NOC_ROWS; ++y) {
    for (int x = 0; x < NOC_COLS; ++x) {
      int node   = y * NOC_COLS + x;
      auto& rtr  = sim.routers[node];

      for (int dir = 0; dir < 5; ++dir) {
        for (int vc = 0; vc < NOC_VCS; ++vc) {
          if (rtr.ingress[dir][vc].empty()) continue;
          auto& pkt   = rtr.ingress[dir][vc].front();
          int next_dir = xy_next_dir(x, y, pkt.dst_x, pkt.dst_y);

          if (next_dir == 4) {
            // Packet arrived
            uint64_t lat = sim.cycle - pkt.injected_cycle + 1;
            sim.total_latency_cycles += lat;
            sim.per_packet_latency.push_back(lat);
            rtr.ingress[dir][vc].pop_front();
          } else {
            // Forward to neighbour — credit check
            if (dir < 4 && rtr.credits[next_dir][vc] == 0) continue; // stall
            if (dir < 4) rtr.credits[next_dir][vc]--;
            int nx = x + (next_dir == 2 ? 1 : next_dir == 3 ? -1 : 0);
            int ny = y + (next_dir == 1 ? 1 : next_dir == 0 ? -1 : 0);
            if (nx < 0 || nx >= NOC_COLS || ny < 0 || ny >= NOC_ROWS) {
              rtr.ingress[dir][vc].pop_front(); // out-of-bounds: drop
              continue;
            }
            int next_node = ny * NOC_COLS + nx;
            sim.routers[next_node].ingress[next_dir ^ 1][vc].push_back(pkt);
            rtr.ingress[dir][vc].pop_front();
          }
        }
      }
    }
  }
  sim.cycle++;
}

// ── Run Simulation for N Cycles ───────────────────────────────────────────────

void noc_run(NoCSimState& sim, uint64_t cycles) {
  for (uint64_t c = 0; c < cycles; ++c) noc_step(sim);
}

struct NoCSimReport {
  uint64_t total_packets;
  double   avg_latency_cycles;
  double   max_latency_cycles;
};

NoCSimReport noc_report(const NoCSimState& sim) {
  double avg = 0, mx = 0;
  if (!sim.per_packet_latency.empty()) {
    uint64_t s = 0;
    for (auto v : sim.per_packet_latency) { s += v; mx = std::max(mx, (double)v); }
    avg = static_cast<double>(s) / sim.per_packet_latency.size();
  }
  return {sim.total_packets, avg, mx};
}
