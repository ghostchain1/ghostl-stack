import fs from "node:fs/promises";
import path from "node:path";
import { ghost } from "@ghostchain/sdk";

export type AuditEvent = Record<string, unknown>;

export const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const hashJson = (value: unknown): string => ghost.keccak256(ghost.toUtf8Bytes(stableStringify(value)));

export async function appendAuditLog(dir: string, record: AuditEvent) {
  await fs.mkdir(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const filePath = path.join(dir, `audit-${day}.jsonl`);
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return filePath;
}

export async function signAuditRecord(wallet: ghost.Wallet, record: AuditEvent) {
  const payload = stableStringify(record);
  const digest = ghost.keccak256(ghost.toUtf8Bytes(payload));
  const sig = await wallet.signMessage(ghost.getBytes(digest));
  return { digest, signature: sig };
}

