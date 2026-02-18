import { createHash } from "node:crypto";

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

export const sha256Hex = (input: string): string => createHash("sha256").update(input).digest("hex");

export const hashObject = (value: unknown): string => sha256Hex(stableStringify(value));
