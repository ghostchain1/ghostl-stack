import fs from "node:fs";
import path from "node:path";
import { Interface, ghost } from "ghost";

export type ProposalCall = { target: string; value: bigint; data: string };

export const EXECUTOR_ABI = ["function executeBatch(address[] targets,uint256[] values,bytes[] datas) external"] as const;

export function buildCall(target: string, abi: readonly string[], functionName: string, args: readonly unknown[]): ProposalCall {
  if (!ghost.isAddress(target) || ghost.getAddress(target) === ghost.ZeroAddress) {
    throw new Error(`invalid_target:${target}`);
  }
  const iface = new Interface(abi);
  const data = iface.encodeFunctionData(functionName, [...args]);
  return { target: ghost.getAddress(target), value: 0n, data };
}

export function buildExecutorBatchCalldata(calls: readonly ProposalCall[]) {
  if (calls.length === 0) throw new Error("no_calls");
  const iface = new Interface(EXECUTOR_ABI);
  return iface.encodeFunctionData("executeBatch", [
    calls.map((c) => c.target),
    calls.map((c) => c.value),
    calls.map((c) => c.data)
  ]);
}

export function writeProposalArtifacts(baseDir: string, name: string, payload: unknown) {
  fs.mkdirSync(baseDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${ts}-${name}`;
  const jsonPath = path.join(baseDir, `${prefix}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { jsonPath, prefix };
}

export function writeTextArtifact(baseDir: string, prefix: string, suffix: string, text: string) {
  fs.mkdirSync(baseDir, { recursive: true });
  const filePath = path.join(baseDir, `${prefix}.${suffix}`);
  fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return filePath;
}

