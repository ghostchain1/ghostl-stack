import { hashObject, sha256Hex } from "./determinism.js";

export type EvidenceInput = {
  kind: string;
  source: string;
  rule: string;
  context: Record<string, unknown>;
  artifacts: string[];
  timestamp?: number;
};

const rootArtifacts = (artifacts: string[]): string => {
  if (artifacts.length === 0) return sha256Hex("empty");
  const sorted = [...artifacts].sort();
  let level = sorted.map((entry) => sha256Hex(entry));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(sha256Hex(`${left}:${right}`));
    }
    level = next;
  }
  return level[0];
};

export const buildEvidencePack = (input: EvidenceInput, policyHash: string) => {
  const artifactsRoot = rootArtifacts(input.artifacts || []);
  const payload = {
    kind: input.kind,
    source: input.source,
    rule: input.rule,
    context: input.context,
    policyHash,
    artifactsRoot,
    timestamp: input.timestamp || Date.now()
  };

  return {
    evidenceId: hashObject(payload),
    policyHash,
    artifactsRoot,
    payload
  };
};
