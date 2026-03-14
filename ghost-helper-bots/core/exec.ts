import { execa } from "execa";
import { log } from "./logger.js";

export async function run(cmd: string, args: string[], cwd: string) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const p = execa(cmd, args, { cwd, stdio: "pipe", reject: false });
  const { stdout, stderr, exitCode } = await p;
  return { stdout, stderr, exitCode: exitCode ?? 0 };
}
