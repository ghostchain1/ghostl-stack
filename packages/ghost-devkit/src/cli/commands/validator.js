import { Logger } from "../../utils/Logger.js";
import { GhostValidatorManager } from "../../validator/GhostValidatorManager.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
const log = Logger.create("validator");
const USAGE = `
ghost validator <subcommand>

  start    Start the validator node
  stop     Stop the validator node
  status   Show validator health
  restart  Restart the validator node
  repair   Run auto-repair on low-peer nodes
`;
export async function run(ctx) {
    const sub = ctx.args[1];
    const cfg = await ConfigLoader.loadFrom();
    const mgr = new GhostValidatorManager(cfg.rpc[cfg.network]);
    switch (sub) {
        case "start":
            log.info("Starting validator…");
            await mgr.start();
            break;
        case "stop":
            log.info("Stopping validator…");
            await mgr.stop();
            break;
        case "restart":
            log.info("Restarting validator…");
            await mgr.restart();
            break;
        case "status": {
            const h = await mgr.status();
            console.log(JSON.stringify(h, null, 2));
            break;
        }
        case "repair": {
            log.info("Running auto-repair…");
            await mgr.autoRepair();
            break;
        }
        default:
            console.log(USAGE);
    }
}
