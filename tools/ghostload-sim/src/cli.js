import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, runSimulation } from "./sim.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((a) => a.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const scenarioName = arg("scenario", "l1-fee-spike");
const outputPath = arg("out", path.join(__dirname, "..", "reports", `${scenarioName}.json`));

const scenario = loadScenario(scenarioName);
const result = runSimulation({ scenario });

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(JSON.stringify(result, null, 2));
if (!result.acceptance.allPassed) process.exitCode = 1;
