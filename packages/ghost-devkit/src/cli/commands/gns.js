import { Logger } from "../../utils/Logger.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
const log = Logger.create("gns");
const USAGE = `
ghost gns <subcommand>

  resolve   Resolve a GNS name to an address
  register  Register a GNS name (requires wallet key)
  list      List all registered names (if indexer available)
`;
async function callGhostBrain(ghostbrainUrl, path, body) {
    const res = await fetch(`${ghostbrainUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
        throw new Error(`GhostBrain HTTP ${res.status}`);
    return res.json();
}
export async function run(ctx) {
    const sub = ctx.args[1] ?? "resolve";
    const cfg = await ConfigLoader.loadFrom();
    switch (sub) {
        case "resolve": {
            const name = ctx.args[2];
            if (!name) {
                log.error("Usage: ghost gns resolve <name>");
                process.exit(1);
            }
            log.info(`Resolving: ${name}`);
            try {
                const resp = await callGhostBrain(cfg.ghostbrainUrl, "/gns/resolve", { name });
                console.log(JSON.stringify(resp, null, 2));
            }
            catch (err) {
                log.error(`Resolve failed: ${err.message}`);
                process.exit(1);
            }
            break;
        }
        case "register": {
            const name = ctx.args[2];
            const addr = ctx.flags["address"];
            if (!name || !addr) {
                log.error("Usage: ghost gns register <name> --address <0x…>");
                process.exit(1);
            }
            log.info(`Registering ${name} → ${addr}`);
            try {
                const resp = await callGhostBrain(cfg.ghostbrainUrl, "/gns/register", { name, address: addr });
                console.log(JSON.stringify(resp, null, 2));
            }
            catch (err) {
                log.error(`Register failed: ${err.message}`);
                process.exit(1);
            }
            break;
        }
        case "list": {
            log.info("Fetching registered GNS names…");
            try {
                const resp = await callGhostBrain(cfg.ghostbrainUrl, "/gns/list", {});
                console.log(JSON.stringify(resp, null, 2));
            }
            catch (err) {
                log.error(`List failed: ${err.message}`);
                process.exit(1);
            }
            break;
        }
        default:
            console.log(USAGE);
    }
}
