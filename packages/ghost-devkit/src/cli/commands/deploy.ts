import { Logger } from "../../utils/Logger.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
import { GhostDeploymentEngine } from "../../deployment/GhostDeploymentEngine.js";
import type { CLIContext } from "../GhostCLI.js";

const log = Logger.create("deploy");

export async function run(ctx: CLIContext): Promise<void> {
  const cfg   = await ConfigLoader.loadFrom();
  const network  = (ctx.flags["network"] ?? ctx.flags["n"] ?? cfg.network) as "l1" | "l2" | "l3";
  const contract = ctx.args[1] ?? ctx.flags["contract"] as string | undefined;
  const script   = ctx.flags["script"] as string | undefined;

  if (!contract && !script) {
    log.error("Specify a contract name or --script <path>");
    process.exit(1);
  }

  const rpcUrl = cfg.rpc[network];
  log.info(`Deploying to ${network} (${rpcUrl})…`);

  const engine = new GhostDeploymentEngine({ rpcUrl, confirmations: cfg.deployment.confirmations });

  if (script) {
    await engine.runScript(script, network);
  } else {
    await engine.deploy(contract!, network);
  }
}
