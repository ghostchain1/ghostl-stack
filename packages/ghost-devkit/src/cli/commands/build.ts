import { Logger } from "../../utils/Logger.js";
import { ProcessRunner } from "../../utils/ProcessRunner.js";
import { ConfigLoader } from "../../utils/ConfigLoader.js";
import type { CLIContext } from "../GhostCLI.js";

const log = Logger.create("build");

export async function run(ctx: CLIContext): Promise<void> {
  const cfg = await ConfigLoader.loadFrom();
  const target = ctx.flags["target"] as string | undefined;
  const cwd = process.cwd();

  log.info("Starting Ghost build…");

  const tasks: Array<{ label: string; cmd: string; args: string[]; cwd?: string }> = [];

  if (!target || target === "contracts") {
    tasks.push({
      label: "Forge compile",
      cmd: "forge",
      args: ["build"],
      cwd: cfg.foundry.projectRoot,
    });
  }

  if (!target || target === "node") {
    tasks.push({ label: "TypeScript build", cmd: "npm", args: ["run", "build"], cwd });
  }

  for (const task of tasks) {
    log.info(`  ${task.label}…`);
    const result = await ProcessRunner.run(task.cmd, task.args, {
      cwd: task.cwd ?? cwd,
      stream: true,
    });
    if (result.code !== 0) {
      log.error(`${task.label} failed (exit ${result.code})`);
      process.exit(result.code);
    }
    log.info(`  ${task.label} — done`);
  }

  log.info("Build complete.");
}
