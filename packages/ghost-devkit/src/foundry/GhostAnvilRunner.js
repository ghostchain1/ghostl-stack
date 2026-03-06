import { spawn } from "node:child_process";
const LAYER_DEFAULTS = {
    l1: { port: 18545, chainId: 14000101 },
    l2: { port: 29547, chainId: 901 },
    l3: { port: 39545, chainId: 903 },
};
export class GhostAnvilRunner {
    proc = null;
    opts;
    constructor(opts = {}) {
        this.opts = {
            port: opts.port ?? 8545,
            chainId: opts.chainId ?? 31337,
            blockTime: opts.blockTime ?? 0,
            accounts: opts.accounts ?? 10,
            balance: opts.balance ?? 10_000,
            forkUrl: opts.forkUrl ?? "",
            forkBlock: opts.forkBlock ?? 0,
            silent: opts.silent ?? false,
        };
    }
    static forLayer(layer, overrides = {}) {
        return new GhostAnvilRunner({ ...LAYER_DEFAULTS[layer], ...overrides });
    }
    start() {
        const args = [
            "--port", String(this.opts.port),
            "--chain-id", String(this.opts.chainId),
            "--accounts", String(this.opts.accounts),
            "--balance", String(this.opts.balance),
        ];
        if (this.opts.blockTime > 0)
            args.push("--block-time", String(this.opts.blockTime));
        if (this.opts.forkUrl)
            args.push("--fork-url", this.opts.forkUrl);
        if (this.opts.forkBlock > 0)
            args.push("--fork-block-number", String(this.opts.forkBlock));
        if (this.opts.silent)
            args.push("--silent");
        this.proc = spawn("anvil", args, {
            stdio: this.opts.silent ? "pipe" : "inherit",
            detached: false,
        });
        return this.proc;
    }
    stop() {
        if (this.proc) {
            this.proc.kill("SIGTERM");
            this.proc = null;
        }
    }
    get pid() {
        return this.proc?.pid;
    }
    /** Wait until the RPC is answering (polls eth_blockNumber) */
    async waitReady(timeoutMs = 10_000) {
        const url = `http://127.0.0.1:${this.opts.port}`;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] }),
                    signal: AbortSignal.timeout(1000),
                });
                if (res.ok)
                    return;
            }
            catch { /* not ready yet */ }
            await new Promise((r) => setTimeout(r, 300));
        }
        throw new Error(`Anvil did not start within ${timeoutMs}ms on port ${this.opts.port}`);
    }
    /** Convenience: snapshot (evm_snapshot) */
    async snapshot() {
        const res = await fetch(`http://127.0.0.1:${this.opts.port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "evm_snapshot", params: [] }),
        });
        const j = await res.json();
        return j.result;
    }
    /** Revert to a snapshot */
    async revert(snapshotId) {
        await fetch(`http://127.0.0.1:${this.opts.port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "evm_revert", params: [snapshotId] }),
        });
    }
}
