// GhostBrain — NoC Router (RTL)
// ============================================================
// XY-routing wormhole-flow-control router for a 2D mesh NoC.
// 5 ports: North, South, East, West, Local.
// 8 virtual channels (VCs) per port, credit-based flow control.
// Flit width: 512 bits (64 bytes).
// Clock target: 4 GHz (TSMC 7nm ASIC), ~1 GHz (FPGA prototype).

`timescale 1ns/1ps

module noc_router #(
    parameter int FLIT_W    = 512,  // flit width in bits
    parameter int X_W       = 4,    // X-coordinate width (supports 0..15)
    parameter int Y_W       = 4,    // Y-coordinate width
    parameter int N_VC      = 8,    // virtual channels
    parameter int CREDITS   = 4,    // credits per VC buffer
    parameter int FIFO_DEPTH = 8    // input FIFO depth per VC
) (
    input  logic              clk,
    input  logic              rst_n,

    // ── Router address ────────────────────────────────────────
    input  logic [X_W-1:0]   my_x,
    input  logic [Y_W-1:0]   my_y,

    // ── Input ports: {N, S, E, W, Local} ─────────────────────
    input  logic [4:0][N_VC-1:0][FLIT_W-1:0] in_flit,
    input  logic [4:0][N_VC-1:0]              in_valid,
    output logic [4:0][N_VC-1:0]              in_credit,  // credit returned to sender

    // ── Output ports: {N, S, E, W, Local} ────────────────────
    output logic [4:0][N_VC-1:0][FLIT_W-1:0] out_flit,
    output logic [4:0][N_VC-1:0]              out_valid,
    input  logic [4:0][N_VC-1:0]              out_credit  // credits from downstream
);

// ── Port indices ─────────────────────────────────────────────
localparam int P_N     = 0;
localparam int P_S     = 1;
localparam int P_E     = 2;
localparam int P_W     = 3;
localparam int P_LOCAL = 4;
localparam int N_PORTS = 5;

// ── Header Flit Layout ────────────────────────────────────────
// [FLIT_W-1] = head_tail
// [FLIT_W-2:FLIT_W-1-X_W] = dst_x
// [FLIT_W-2-X_W:FLIT_W-2-X_W-Y_W+1] = dst_y
// [2:0] = vc

function automatic logic [2:0] get_out_port(
    input logic [X_W-1:0] dst_x,
    input logic [Y_W-1:0] dst_y,
    input logic [X_W-1:0] cur_x,
    input logic [Y_W-1:0] cur_y
);
    // XY routing: first route on X, then on Y
    if (dst_x > cur_x)      return P_E;
    else if (dst_x < cur_x) return P_W;
    else if (dst_y > cur_y) return P_S;
    else if (dst_y < cur_y) return P_N;
    else                    return P_LOCAL;
endfunction

// ── Credit Counters ───────────────────────────────────────────
logic [$clog2(CREDITS+1)-1:0] credits [N_PORTS][N_VC];

// ── Simple round-robin arbitration per output port ───────────
logic [2:0] rr_ptr [N_PORTS];   // last winner per output port

// ── Pipeline Stage: Decode + Route ───────────────────────────
always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        for (int p = 0; p < N_PORTS; p++) begin
            out_valid[p]  <= '0;
            in_credit[p]  <= '0;
            rr_ptr[p]     <= '0;
            for (int vc = 0; vc < N_VC; vc++)
                credits[p][vc] <= CREDITS[$clog2(CREDITS+1)-1:0];
        end
    end else begin
        // Accept credits from downstream
        for (int p = 0; p < N_PORTS; p++)
            for (int vc = 0; vc < N_VC; vc++)
                if (out_credit[p][vc] && credits[p][vc] < CREDITS[$clog2(CREDITS+1)-1:0])
                    credits[p][vc] <= credits[p][vc] + 1;

        // Route each input flit to its output port
        for (int in_p = 0; in_p < N_PORTS; in_p++) begin
            for (int vc = 0; vc < N_VC; vc++) begin
                in_credit[in_p][vc] <= 1'b0;
                if (in_valid[in_p][vc]) begin
                    // Decode header
                    logic [X_W-1:0] dst_x;
                    logic [Y_W-1:0] dst_y;
                    dst_x = in_flit[in_p][vc][FLIT_W-2 -: X_W];
                    dst_y = in_flit[in_p][vc][FLIT_W-2-X_W -: Y_W];
                    int out_p = get_out_port(dst_x, dst_y, my_x, my_y);

                    // Send if credits available
                    if (credits[out_p][vc] > 0) begin
                        out_flit[out_p][vc]  <= in_flit[in_p][vc];
                        out_valid[out_p][vc] <= 1'b1;
                        credits[out_p][vc]   <= credits[out_p][vc] - 1;
                        in_credit[in_p][vc]  <= 1'b1;   // return credit to sender
                    end else begin
                        out_valid[out_p][vc] <= 1'b0;
                    end
                end
            end
        end
    end
end

endmodule : noc_router
