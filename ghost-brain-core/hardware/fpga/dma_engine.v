// GhostBrain — DMA Engine (RTL)
// ============================================================
// Scatter/Gather DMA that moves tensors between:
//   • On-chip SRAM (Tile-Local Memory)
//   • HBM3 (via memory controller AXI4)
//   • NoC peer tiles (via NoC router inject port)
//
// Descriptor-based: FIFO of DMA descriptors, each specifying
//   src_addr, dst_addr, len_bytes, channel (SRAM/HBM/NoC)
//
// AXI4 master interface: 512-bit data bus, outstanding=16 bursts

`timescale 1ns/1ps

module dma_engine #(
    parameter int ADDR_W      = 40,    // physical address width
    parameter int DATA_W      = 512,   // bus width (bytes = DATA_W/8 = 64)
    parameter int BURST_LEN   = 16,    // AXI ARLEN (16 beats = 1KB per burst)
    parameter int FIFO_DEPTH  = 32,    // descriptor FIFO depth
    parameter int OUTSTANDING = 16     // max in-flight bursts
) (
    input  logic                  clk,
    input  logic                  rst_n,

    // ── Descriptor FIFO ─────────────────────────────────────
    input  logic [ADDR_W-1:0]     desc_src,
    input  logic [ADDR_W-1:0]     desc_dst,
    input  logic [31:0]           desc_len,     // byte length
    input  logic [1:0]            desc_chan,    // 0=SRAM, 1=HBM, 2=NoC
    input  logic                  desc_push,
    output logic                  desc_full,
    output logic                  desc_empty,

    // ── AXI4 Master (HBM read) ────────────────────────────
    // AR channel
    output logic [ADDR_W-1:0]    m_axi_araddr,
    output logic [7:0]           m_axi_arlen,
    output logic                 m_axi_arvalid,
    input  logic                 m_axi_arready,
    // R channel
    input  logic [DATA_W-1:0]   m_axi_rdata,
    input  logic                 m_axi_rvalid,
    input  logic                 m_axi_rlast,
    output logic                 m_axi_rready,
    // AW channel
    output logic [ADDR_W-1:0]    m_axi_awaddr,
    output logic [7:0]           m_axi_awlen,
    output logic                 m_axi_awvalid,
    input  logic                 m_axi_awready,
    // W channel
    output logic [DATA_W-1:0]    m_axi_wdata,
    output logic                 m_axi_wlast,
    output logic                 m_axi_wvalid,
    input  logic                 m_axi_wready,
    // B channel
    input  logic [1:0]           m_axi_bresp,
    input  logic                 m_axi_bvalid,
    output logic                 m_axi_bready,

    // ── Status ───────────────────────────────────────────────
    output logic                 busy,
    output logic                 error,    // AXI SLVERR / DECERR
    output logic [31:0]          bytes_transferred
);

// ── Descriptor FIFO ──────────────────────────────────────────
localparam int DESC_W = ADDR_W * 2 + 32 + 2;
logic [DESC_W-1:0] fifo [FIFO_DEPTH];
logic [$clog2(FIFO_DEPTH):0] wr_ptr, rd_ptr;

assign desc_full  = (wr_ptr - rd_ptr) == FIFO_DEPTH[$clog2(FIFO_DEPTH):0];
assign desc_empty = (wr_ptr == rd_ptr);

always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        wr_ptr <= '0;
        rd_ptr <= '0;
    end else if (desc_push && !desc_full) begin
        fifo[wr_ptr[$clog2(FIFO_DEPTH)-1:0]] <=
            {desc_src, desc_dst, desc_len, desc_chan};
        wr_ptr <= wr_ptr + 1;
    end
end

// ── Transfer State Machine ────────────────────────────────────
typedef enum logic [2:0] {
    IDLE, FETCH_DESC, ISSUE_READ, WAIT_DATA, ISSUE_WRITE, WAIT_BRESP, DONE
} state_t;

state_t  state;
logic [ADDR_W-1:0]  cur_src, cur_dst, cur_read_addr, cur_write_addr;
logic [31:0]        rem_bytes;
logic [1:0]         cur_chan;

assign busy = (state != IDLE);
assign m_axi_arlen  = BURST_LEN - 1;
assign m_axi_awlen  = BURST_LEN - 1;
assign m_axi_bready = 1'b1;
assign m_axi_rready = (state == WAIT_DATA);

always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        state             <= IDLE;
        error             <= 1'b0;
        bytes_transferred <= '0;
        m_axi_arvalid     <= 1'b0;
        m_axi_awvalid     <= 1'b0;
        m_axi_wvalid      <= 1'b0;
        m_axi_wlast       <= 1'b0;
    end else begin
        case (state)
            IDLE: begin
                if (!desc_empty) begin
                    state <= FETCH_DESC;
                end
            end
            FETCH_DESC: begin
                {cur_src, cur_dst, rem_bytes, cur_chan} <=
                    fifo[rd_ptr[$clog2(FIFO_DEPTH)-1:0]];
                rd_ptr        <= rd_ptr + 1;
                cur_read_addr  <= cur_src;
                cur_write_addr <= cur_dst;
                state         <= ISSUE_READ;
            end
            ISSUE_READ: begin
                m_axi_araddr  <= cur_read_addr;
                m_axi_arvalid <= 1'b1;
                if (m_axi_arready) begin
                    m_axi_arvalid <= 1'b0;
                    state         <= WAIT_DATA;
                end
            end
            WAIT_DATA: begin
                if (m_axi_rvalid) begin
                    m_axi_wdata  <= m_axi_rdata;
                    m_axi_wvalid <= 1'b1;
                    if (m_axi_rlast) begin
                        m_axi_wlast <= 1'b1;
                        state       <= ISSUE_WRITE;
                    end
                end
            end
            ISSUE_WRITE: begin
                m_axi_awaddr  <= cur_write_addr;
                m_axi_awvalid <= 1'b1;
                if (m_axi_awready && m_axi_wready) begin
                    m_axi_awvalid <= 1'b0;
                    m_axi_wvalid  <= 1'b0;
                    m_axi_wlast   <= 1'b0;
                    state         <= WAIT_BRESP;
                    cur_read_addr  <= cur_read_addr + (BURST_LEN * DATA_W/8);
                    cur_write_addr <= cur_write_addr + (BURST_LEN * DATA_W/8);
                    rem_bytes      <= rem_bytes > (BURST_LEN * DATA_W/8) ?
                                     rem_bytes - (BURST_LEN * DATA_W/8) : '0;
                    bytes_transferred <= bytes_transferred + (BURST_LEN * DATA_W/8);
                end
            end
            WAIT_BRESP: begin
                if (m_axi_bvalid) begin
                    if (m_axi_bresp != 2'b00) error <= 1'b1;
                    state <= (rem_bytes > 0) ? ISSUE_READ : IDLE;
                end
            end
            default: state <= IDLE;
        endcase
    end
end

endmodule : dma_engine
