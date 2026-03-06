import { Logger } from "../utils/Logger.js";
import { ConfigLoader } from "../utils/ConfigLoader.js";
const log = Logger.create("NetworkMonitor");
export class GhostNetworkMonitor {
    async status() {
        const cfg = await ConfigLoader.loadFrom();
        const [l1, l2, l3] = await Promise.all([
            this.probeLayer(cfg.rpc.l1 ?? "http://127.0.0.1:18545"),
            this.probeLayer(cfg.rpc.l2 ?? "http://127.0.0.1:29547"),
            this.probeLayer(cfg.rpc.l3 ?? "http://127.0.0.1:39545"),
        ]);
        const timestamp = new Date().toISOString();
        log.info(`L1=${l1.online ? "online" : "offline"} L2=${l2.online ? "online" : "offline"} L3=${l3.online ? "online" : "offline"}`);
        return { l1, l2, l3, timestamp };
    }
    async probeLayer(rpcUrl) {
        const start = Date.now();
        try {
            const res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_blockNumber", params: [] }),
                signal: AbortSignal.timeout(4_000),
            });
            const latencyMs = Date.now() - start;
            const j = await res.json();
            if (j.error)
                return { rpcUrl, latencyMs, online: false };
            const [peersRes, syncRes] = await Promise.all([
                this.rpcCall(rpcUrl, "net_peerCount", []),
                this.rpcCall(rpcUrl, "eth_syncing", []),
            ]);
            return {
                rpcUrl,
                blockNumber: BigInt(j.result),
                peerCount: parseInt(peersRes, 16),
                syncing: Boolean(syncRes),
                latencyMs,
                online: true,
            };
        }
        catch {
            return { rpcUrl, online: false };
        }
    }
    async rpcCall(url, method, params) {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
            signal: AbortSignal.timeout(3_000),
        });
        const j = await r.json();
        return j.result;
    }
}
