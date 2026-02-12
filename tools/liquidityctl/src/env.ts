import fs from "node:fs";

export type EnvMap = Record<string, string>;

export function loadEnvFile(filePath: string): EnvMap {
  const out: EnvMap = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function getEnv(env: EnvMap, key: string, fallback?: string) {
  const v = env[key] ?? process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`missing_env:${key}`);
  return String(v);
}

