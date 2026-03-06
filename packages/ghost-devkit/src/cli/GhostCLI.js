import { Logger } from "../utils/Logger.js";
const log = Logger.create("CLI");
const HELP = `
👻 Ghost CLI — GhostStack Sovereign Developer Platform

Usage: ghost <command> [options]

Commands:
  init       Scaffold a new Ghost project
  build      Build contracts and packages
  deploy     Deploy contracts to a network layer
  test       Run forge/hardhat tests
  validator  Manage validators (start|stop|status|restart)
  audit      AI contract security audit
  doctor     Diagnose stack health
  network    Network status (status|switch|ping)
  wallet     Wallet operations (create|import|balance)
  bridge     Bridge monitoring (monitor|status)
  gns        GhostNameService (resolve|register)

Use ghost <command> --help for command-specific options.
`;
export function parseArgs(argv) {
    const raw = argv.slice(2);
    const args = [];
    const flags = {};
    for (let i = 0; i < raw.length; i++) {
        const tok = raw[i];
        if (tok.startsWith("--")) {
            const eq = tok.indexOf("=");
            if (eq !== -1) {
                flags[tok.slice(2, eq)] = tok.slice(eq + 1);
            }
            else {
                const next = raw[i + 1];
                if (next && !next.startsWith("-")) {
                    flags[tok.slice(2)] = next;
                    i++;
                }
                else {
                    flags[tok.slice(2)] = true;
                }
            }
        }
        else if (tok.startsWith("-") && tok.length === 2) {
            flags[tok.slice(1)] = true;
        }
        else {
            args.push(tok);
        }
    }
    return { args, flags, raw };
}
export class GhostCLI {
    async run(argv = process.argv) {
        const ctx = parseArgs(argv);
        const command = ctx.args[0];
        if (!command || ctx.flags["help"] || ctx.flags["h"]) {
            console.log(HELP);
            return;
        }
        if (ctx.flags["version"] || ctx.flags["v"]) {
            const { createRequire } = await import("node:module");
            const req = createRequire(import.meta.url);
            const pkg = req("../../package.json");
            console.log(`ghost-devkit v${pkg.version}`);
            return;
        }
        try {
            switch (command) {
                case "init":
                    return (await import("./commands/init.js")).run(ctx);
                case "build":
                    return (await import("./commands/build.js")).run(ctx);
                case "deploy":
                    return (await import("./commands/deploy.js")).run(ctx);
                case "test":
                    return (await import("./commands/test.js")).run(ctx);
                case "validator":
                    return (await import("./commands/validator.js")).run(ctx);
                case "audit":
                    return (await import("./commands/audit.js")).run(ctx);
                case "doctor":
                    return (await import("./commands/doctor.js")).run(ctx);
                case "network":
                    return (await import("./commands/network.js")).run(ctx);
                case "wallet":
                    return (await import("./commands/wallet.js")).run(ctx);
                case "bridge":
                    return (await import("./commands/bridge.js")).run(ctx);
                case "gns":
                    return (await import("./commands/gns.js")).run(ctx);
                default:
                    log.error(`Unknown command: ${command}`);
                    console.log(HELP);
                    process.exit(1);
            }
        }
        catch (err) {
            log.error(`Command failed: ${err.message}`);
            process.exit(1);
        }
    }
}
