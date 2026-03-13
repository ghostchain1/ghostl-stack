#!/usr/bin/env node
import { GhostCLI } from "../dist/cli/GhostCLI.js";

const cli = new GhostCLI();
cli.run(process.argv.slice(2)).catch((err) => {
  console.error(`\x1b[31mFatal:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
