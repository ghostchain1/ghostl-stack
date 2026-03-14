import { Logger } from "../../utils/Logger.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
const log = Logger.create("network");
const USAGE = `
ghost network <subcommand>

  status   Show live status of all layers (L1/L2/L3)
  switch   Switch active network layer (l1|l2|l3)
  ping     Ping a specific RPC endpoint
`;
async function rpcRequest(url, method, params = []) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
        signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    if (json.error)
        throw new Error(json.error.message);
    return json.result;
}
async function layerStatus(label, url) {
    try {
        const [blockHex, peersHex, syncingRaw] = await Promise.all([
            rpcRequest(url, "eth_blockNumber"),
            rpcRequest(url, "net_peerCount"),
            rpcRequest(url, "eth_syncing"),
        ]);
        const block = parseInt(blockHex, 16);
        const peers = parseInt(peersHex, 16);
        const syncing = syncingRaw !== false;
        return { label, block, peers, syncing, healthy: true, error: undefined };
    }
    catch (err) {
        return { label, block: 0, peers: 0, syncing: false, healthy: false, error: err.message };
    }
}
export async function run(ctx) {
    const sub = ctx.args[1] ?? "status";
    const cfg = await ConfigLoader.loadFrom();
    switch (sub) {
        case "status": {
            log.info("Fetching GhostStack network status…");
            const [l1, l2, l3] = await Promise.all([
                layerStatus("L1", cfg.rpc.l1),
                layerStatus("L2", cfg.rpc.l2),
                layerStatus("L3", cfg.rpc.l3),
            ]);
            for (const s of [l1, l2, l3]) {
                const icon = s.healthy ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
                console.log(`${icon} ${s.label.padEnd(4)} block=${s.block} peers=${s.peers} syncing=${s.syncing}${s.error ? ` (${s.error})` : ""}`);
            }
            break;
        }
        case "switch": {
            const layer = ctx.args[2];
            if (!layer || !["l1", "l2", "l3"].includes(layer)) {
                log.error("Usage: ghost network switch <l1|l2|l3>");
                process.exit(1);
            }
            log.info(`Active network set to: ${layer} (update ghost.config.json to persist)`);
            break;
        }
        case "ping": {
            const target = ctx.args[2];
            const url = target ?? cfg.rpc[cfg.network];
            log.info(`Pinging ${url}…`);
            try {
                const block = await rpcRequest(url, "eth_blockNumber");
                log.info(`OK — block ${parseInt(block, 16)}`);
            }
            catch (err) {
                log.error(`Ping failed: ${err.message}`);
                process.exit(1);
            }
            break;
        }
        default:
            console.log(USAGE);
    }
}
