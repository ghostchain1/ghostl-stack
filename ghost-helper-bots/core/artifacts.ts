import fs from "node:fs";
import path from "node:path";

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function writeText(file: string, contents: string) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, contents, "utf8");
}

export function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
