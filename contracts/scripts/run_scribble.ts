import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "reports", "formal", "scribble");
mkdirSync(outDir, { recursive: true });

type ScribbleConfig = {
  input?: string;
  outputMode?: "flat" | "files" | "json";
  output?: string;
  compiler?: {
    version?: string;
  };
};

const configPath = path.join(root, "formal", "scribble.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as ScribbleConfig;
const inputDir = config.input ? path.join(root, config.input) : path.join(root, "src");
const outputMode = config.outputMode ?? "json";
const outputPath = config.output ? path.join(root, config.output) : path.join(outDir, "scribble.json");
const compilerVersion = config.compiler?.version;

const collectSolFiles = (dir: string, files: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSolFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".sol")) {
      files.push(path.relative(root, fullPath));
    }
  }
  return files;
};

const solFiles = collectSolFiles(inputDir);
if (solFiles.length === 0) {
  throw new Error(`No Solidity files found under ${inputDir}`);
}

const args = ["scribble", "--input-mode", "source", "--output-mode", outputMode, "--base-path", root];
if (compilerVersion) {
  args.push("--compiler-version", compilerVersion);
}
if (outputMode === "flat" || outputMode === "json") {
  args.push("--output", outputPath);
}
if (outputMode === "files") {
  args.push("--utils-output-path", outputPath);
}
args.push("--solFiles", ...solFiles);

const result = spawnSync("npx", args, { cwd: root, stdio: "inherit" });
const summaryPath = path.join(root, "reports", "formal", "summary.json");
writeFileSync(
  summaryPath,
  JSON.stringify(
    { tool: "scribble", status: result.status === 0 ? "ok" : "failed", updatedAt: new Date().toISOString() },
    null,
    2
  )
);
process.exit(result.status ?? 1);
