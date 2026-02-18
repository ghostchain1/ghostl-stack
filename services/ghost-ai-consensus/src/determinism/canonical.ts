import { createHash } from "node:crypto";

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${pairs.join(",")}}`;
};

export const hashHex = (value: unknown): string => {
  const payload = typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(payload).digest("hex");
};

export const merkleRoot = (leaves: string[]): string => {
  if (leaves.length === 0) {
    return hashHex("ghost.empty.merkle");
  }

  let level = leaves.map((leaf) => hashHex(leaf)).sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(hashHex(`${left}${right}`));
    }
    level = next.sort();
  }
  return level[0];
};

export const canonicalObject = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value) || !isObject(value)) {
    return { value };
  }

  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (Array.isArray(child)) {
      output[key] = child.map((entry) => (typeof entry === "object" && entry !== null ? canonicalObject(entry) : entry));
      continue;
    }
    output[key] = typeof child === "object" && child !== null ? canonicalObject(child) : child;
  }
  return output;
};
