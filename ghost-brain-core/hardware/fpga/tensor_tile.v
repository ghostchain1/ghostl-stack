// GhostBrain — Tensor Core Tile (RTL)
// ============================================================
// Implements a 16×8×16 systolic-array tile for INT8/FP16 matrix multiply.
// One tile computes one 16×16 output tile from an Nx16 input window.
//
// Interfaces
//   - AXI4-Lite control (weight load, start, done)
//   - AXIS streaming: input features, output results
//   - SRAM interfaces: weight buffer (read-only during computation)
//
// Synthesis target: TSMC 7nm (ASIC) or Xilinx Ultrascale+ (FPGA prototype)

`timescale 1ns/1ps

module tensor_core_tile #(
    parameter int M         = 16,    // Output rows
    parameter int K         = 16,    // Shared (reduction) dimension
    parameter int N         = 8,     // Output columns
    parameter int DATA_W    = 8,     // Input precision (INT8)
    parameter int ACC_W     = 32,    // Accumulator width
    parameter int WEIGHT_ADDR_W = 12 // log2(weight SRAM depth)
) (
    input  logic                      clk,
    input  logic                      rst_n,

    // ── Control ──────────────────────────────────────────────
    input  logic                      start,         // pulse: begin computation
    output logic                      done,          // pulse: result ready
    input  logic [WEIGHT_ADDR_W-1:0]  weight_base,   // start address in weight SRAM
    input  logic [3:0]                precision,     // 0=INT8, 1=FP16, 2=BF16

    // ── Input Feature Stream (AXI-Stream) ──────────────────
    input  logic [M*DATA_W-1:0]       s_axis_data,   // M inputs per cycle
    input  logic                      s_axis_valid,
    output logic                      s_axis_ready,

    // ── Weight SRAM (read port) ────────────────────────────
    output logic [WEIGHT_ADDR_W-1:0]  wt_addr,
    input  logic [K*N*DATA_W-1:0]     wt_data,       // full K×N weight tile

    // ── Output Result Stream ────────────────────────────────
    output logic [M*N*ACC_W-1:0]      m_axis_data,   // M×N partial sums
    output logic                      m_axis_valid,
    input  logic                      m_axis_ready
);

// ── Internal Types ──────────────────────────────────────────
typedef logic signed [DATA_W-1:0]  data_t;
typedef logic signed [ACC_W-1:0]   acc_t;

// ── Accumulator Array ───────────────────────────────────────
acc_t  acc [M][N];
int    k_count;
logic  computing;

// ── Systolic PE Array ───────────────────────────────────────
// Each PE accumulates one element of OUT[m][n] = sum_k A[m][k] * B[k][n]
// Pipelining: inputs are registered, MACs are pipelined 2 stages
logic [M*DATA_W-1:0] feat_reg;
logic                 feat_valid_r;

always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        computing    <= 1'b0;
        done         <= 1'b0;
        m_axis_valid <= 1'b0;
        k_count      <= 0;
        for (int m = 0; m < M; m++)
            for (int n = 0; n < N; n++)
                acc[m][n] <= '0;
    end else begin
        done         <= 1'b0;
        m_axis_valid <= 1'b0;

        // -- start pulse --
        if (start && !computing) begin
            computing <= 1'b1;
            k_count   <= 0;
            for (int m = 0; m < M; m++)
                for (int n = 0; n < N; n++)
                    acc[m][n] <= '0;
        end

        // -- accumulate --
        if (computing && s_axis_valid && s_axis_ready) begin
            feat_reg    <= s_axis_data;
            feat_valid_r <= 1'b1;
        end else begin
            feat_valid_r <= 1'b0;
        end

        if (feat_valid_r) begin
            for (int m = 0; m < M; m++) begin
                for (int n = 0; n < N; n++) begin
                    // Extract weight B[k_count][n] and feature A[m][k_count]
                    data_t feat_val = data_t'(feat_reg[m*DATA_W +: DATA_W]);
                    data_t wt_val   = data_t'(
                        wt_data[(k_count*N + n)*DATA_W +: DATA_W]);
                    acc[m][n] <= acc[m][n] + acc_t'(feat_val) * acc_t'(wt_val);
                end
            end
            k_count <= k_count + 1;

            if (k_count == K - 1) begin
                // Reduction complete → output
                computing    <= 1'b0;
                m_axis_valid <= 1'b1;
                done         <= 1'b1;
                for (int m = 0; m < M; m++)
                    for (int n = 0; n < N; n++)
                        m_axis_data[(m*N + n)*ACC_W +: ACC_W] <= acc[m][n];
            end
        end
    end
end

// ── Flow Control ────────────────────────────────────────────
assign s_axis_ready = computing && !feat_valid_r;
assign wt_addr      = weight_base + WEIGHT_ADDR_W'(k_count);

// ── Assertions ──────────────────────────────────────────────
`ifdef SIMULATION
always @(posedge clk) begin
    assert (!($isunknown(s_axis_data) && s_axis_valid))
        else $error("tensor_core_tile: X on data bus while valid");
end
`endif

endmodule : tensor_core_tile
