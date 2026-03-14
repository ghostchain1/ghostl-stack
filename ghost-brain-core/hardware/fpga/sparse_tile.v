// GhostBrain — Sparse Core Tile (RTL)
// ============================================================
// 2:4 structured-sparse matrix-multiply tile.
// For every 4 consecutive K-values, exactly 2 are non-zero.
// Metadata stores 2-bit selectors per 2-nnz group.
//
// Hardware: 64 parallel lanes, each lane processes one (A_sparse, B_dense) pair.
// Throughput: 2× vs. dense at equal MAC energy (half reads from weight buffer).
//
// Parameters:
//   LANES  — parallel sparse-multiply lanes (default 64)
//   DATA_W — data precision: 8 (INT8) or 16 (FP16)
//   ACC_W  — accumulator precision (32 bits)

`timescale 1ns/1ps

module sparse_core_tile #(
    parameter int LANES  = 64,
    parameter int DATA_W = 8,
    parameter int ACC_W  = 32
) (
    input  logic                          clk,
    input  logic                          rst_n,

    // ── Control ──────────────────────────────────────────────
    input  logic                          start,
    output logic                          done,
    input  logic [$clog2(LANES)-1:0]      n_active_lanes,  // lanes to use

    // ── Compressed Weight Stream ────────────────────────────
    // 2-of-4 compressed: 2 DATA_W values + 4-bit selector per group
    input  logic [LANES*(2*DATA_W+4)-1:0] wt_compressed,
    input  logic                          wt_valid,
    output logic                          wt_ready,

    // ── Dense Activation Tile ────────────────────────────────
    // B columns accessed via selector indices (0..3 → 4 candidates)
    input  logic [LANES*4*DATA_W-1:0]    b_candidates,    // 4 candidates per lane
    input  logic                          b_valid,

    // ── Output ───────────────────────────────────────────────
    output logic [LANES*ACC_W-1:0]        acc_out,
    output logic                          acc_valid
);

typedef logic signed [DATA_W-1:0] data_t;
typedef logic signed [ACC_W-1:0]  acc_t;

// ── Decompress + MAC ─────────────────────────────────────────
// Each lane: pick 2 of 4 B candidates using the 4-bit selector.
// sel[1:0] → index of first NZ, sel[3:2] → index of second NZ

logic [LANES*ACC_W-1:0] acc_reg;
logic                    busy;

always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        acc_reg   <= '0;
        acc_valid <= 1'b0;
        done      <= 1'b0;
        busy      <= 1'b0;
    end else begin
        acc_valid <= 1'b0;
        done      <= 1'b0;

        if (start && !busy) begin
            busy    <= 1'b1;
            acc_reg <= '0;
        end

        if (busy && wt_valid && b_valid) begin
            for (int lane = 0; lane < LANES; lane++) begin
                // Unpack compressed weight for this lane
                logic [2*DATA_W-1:0] wt_vals;
                logic [3:0]          sel;
                wt_vals = wt_compressed[lane*(2*DATA_W+4) +: 2*DATA_W];
                sel     = wt_compressed[lane*(2*DATA_W+4) + 2*DATA_W +: 4];

                // Decompress: select two B candidates
                data_t w0, w1, b0, b1;
                w0 = data_t'(wt_vals[0       +: DATA_W]);
                w1 = data_t'(wt_vals[DATA_W  +: DATA_W]);
                b0 = data_t'(b_candidates[lane*4*DATA_W + sel[1:0]*DATA_W +: DATA_W]);
                b1 = data_t'(b_candidates[lane*4*DATA_W + sel[3:2]*DATA_W +: DATA_W]);

                // Accumulate two MACs
                acc_t prev = acc_t'(acc_reg[lane*ACC_W +: ACC_W]);
                acc_reg[lane*ACC_W +: ACC_W] <=
                    (prev + acc_t'(w0) * acc_t'(b0) + acc_t'(w1) * acc_t'(b1));
            end

            // Latch output after one cycle
            busy      <= 1'b0;
            done      <= 1'b1;
            acc_valid <= 1'b1;
            acc_out   <= acc_reg;
        end
    end
end

assign wt_ready = busy;

endmodule : sparse_core_tile
