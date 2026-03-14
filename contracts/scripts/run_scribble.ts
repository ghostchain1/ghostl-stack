import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
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
    settings?: unknown;
  };
};

const configPath = path.join(root, "formal", "scribble.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as ScribbleConfig;
const inputDir = config.input ? path.join(root, config.input) : path.join(root, "src");
const outputMode = config.outputMode ?? "json";
const outputPath = config.output ? path.join(root, config.output) : path.join(outDir, "scribble.json");
const compilerVersion = config.compiler?.version;
const compilerSettings = config.compiler?.settings;

type SolcList = { releases?: Record<string, string> };

const seedCompilerCacheFromHardhat = (cacheDir: string, version: string) => {
  const base = path.join(os.homedir(), ".cache", "hardhat-nodejs", "compilers-v2");
  for (const prefix of ["wasm", "linux-amd64"]) {
    const srcPrefixDir = path.join(base, prefix);
    const srcListPath = path.join(srcPrefixDir, "list.json");
    if (!existsSync(srcListPath)) continue;
    let compilerFileName: string | undefined;
    try {
      const list = JSON.parse(readFileSync(srcListPath, "utf8")) as SolcList;
      compilerFileName = list.releases?.[version];
    } catch {
      continue;
    }
    if (!compilerFileName) continue;
    const srcCompilerPath = path.join(srcPrefixDir, compilerFileName);
    if (!existsSync(srcCompilerPath)) continue;
    const dstPrefixDir = path.join(cacheDir, prefix);
    mkdirSync(dstPrefixDir, { recursive: true });
    copyFileSync(srcListPath, path.join(dstPrefixDir, "list.json"));
    copyFileSync(srcCompilerPath, path.join(dstPrefixDir, compilerFileName));
  }
};

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

const scribbleArgs = ["--input-mode", "source", "--output-mode", outputMode, "--base-path", root];
if (compilerVersion) {
  scribbleArgs.push("--compiler-version", compilerVersion);
}
if (compilerSettings) {
  scribbleArgs.push("--compiler-settings", JSON.stringify(compilerSettings));
}
if (outputMode === "flat" || outputMode === "json") {
  scribbleArgs.push("--output", outputPath);
}
if (outputMode === "files") {
  scribbleArgs.push("--utils-output-path", outputPath);
}
scribbleArgs.push("--solFiles", ...solFiles);

const scribbleBin = process.env.SCRIBBLE_BIN;
const localScribble = path.join(root, "node_modules", ".bin", "scribble");
const cmd = scribbleBin ?? (existsSync(localScribble) ? localScribble : "npx");
const cmdArgs = scribbleBin ? scribbleArgs : cmd === localScribble ? scribbleArgs : ["scribble", ...scribbleArgs];

const compilerCache = process.env.SOL_AST_COMPILER_CACHE ?? path.join(root, "cache-codex", "solc-typed-ast");
if (compilerVersion) {
  seedCompilerCacheFromHardhat(compilerCache, compilerVersion);
}

const result = spawnSync(cmd, cmdArgs, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, SOL_AST_COMPILER_CACHE: compilerCache }
});
if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
  console.error("[scribble] Binary not found. Install via `npm --prefix contracts ci` or set SCRIBBLE_BIN.");
  process.exit(1);
}
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
