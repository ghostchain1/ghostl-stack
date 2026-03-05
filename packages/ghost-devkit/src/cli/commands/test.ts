import { Logger } from "../../utils/Logger.js";
import { ProcessRunner } from "../../utils/ProcessRunner.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
import type { CLIContext } from "../GhostCLI.js";

const log = Logger.create("test");

export async function run(ctx: CLIContext): Promise<void> {
  const cfg       = await ConfigLoader.loadFrom();
  const matchPath = ctx.flags["match"] as string | undefined;
  const verbose   = Boolean(ctx.flags["verbose"] || ctx.flags["v"]);
  const gas       = Boolean(ctx.flags["gas"]);

  const args: string[] = ["test"];
  if (matchPath)  args.push("--match-path", matchPath);
  if (verbose)    args.push("-vvv");
  if (gas)        args.push("--gas-report");

  log.info(`Running Forge tests${matchPath ? ` (${matchPath})` : ""}…`);

  const result = await ProcessRunner.run("forge", args, {
    cwd:    cfg.foundry.projectRoot,
    stream: true,
  });

  if (result.code !== 0) {
    log.error(`Tests failed (exit ${result.code})`);
    process.exit(result.code);
  }

  log.info("All tests passed.");
}
