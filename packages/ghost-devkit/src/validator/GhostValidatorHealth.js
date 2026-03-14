import { Logger } from "../utils/Logger.js";
const log = Logger.create("ValidatorHealth");
export class GhostValidatorHealth {
    async check(rpcUrl) {
        try {
            const [blockHex, peersHex, syncRes] = await Promise.all([
                this.rpc(rpcUrl, "eth_blockNumber", []),
                this.rpc(rpcUrl, "net_peerCount", []),
                this.rpc(rpcUrl, "eth_syncing", []),
            ]);
            const block = BigInt(blockHex);
            const peers = parseInt(peersHex, 16);
            const syncing = Boolean(syncRes);
            const healthy = !syncing && block > 0n;
            log.debug(`block=${block} peers=${peers} syncing=${syncing} healthy=${healthy}`);
            return { block, peers, syncing, healthy };
        }
        catch (err) {
            log.error(`Health check failed: ${err instanceof Error ? err.message : String(err)}`);
            return { healthy: false };
        }
    }
    async rpc(url, method, params) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
            signal: AbortSignal.timeout(5_000),
        });
        const j = await res.json();
        if (j.error)
            throw new Error(j.error.message);
        return j.result;
    }
}
