import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type GovernanceTarget = "devnet" | "testnet" | "mainnet";

export interface ProposalInput {
  title: string;
  summary: string;
  target: GovernanceTarget;
  contractAddress: string;
  functionSignature: string;
  args: string[];
  votingWindowHours: number;
  quorumBps: number;
}

export interface ProposalBundle {
  proposalId: string;
  humanReadable: string;
  calldataPayload: string;
  foundrySimulationCommand: string;
  constitutionalGate: {
    switchFile: string;
    allowDeploy: false;
    requiresOutcome: "PASSED";
  };
}

function normalizedPayload(input: ProposalInput): string {
  return JSON.stringify({
    title: input.title.trim(),
    target: input.target,
    contractAddress: input.contractAddress.toLowerCase(),
    functionSignature: input.functionSignature,
    args: input.args,
    votingWindowHours: input.votingWindowHours,
    quorumBps: input.quorumBps,
  });
}

function pseudoCalldata(input: ProposalInput): string {
  const payload = `${input.functionSignature}|${input.args.join(",")}`;
  return `0x${createHash("sha256").update(payload).digest("hex")}`;
}

export function buildProposal(input: ProposalInput): ProposalBundle {
  const proposalHash = createHash("sha256").update(normalizedPayload(input)).digest("hex");
  const proposalId = `gp-${proposalHash.slice(0, 16)}`;
  const gateFile = `/home/ghost/ghostl-stack/tools/ghostcontrol/governance/gates/${proposalId}.json`;

  return {
    proposalId,
    humanReadable:
      `${input.title}\n` +
      `target=${input.target}\n` +
      `contract=${input.contractAddress}\n` +
      `call=${input.functionSignature}(${input.args.join(", ")})\n` +
      `window_hours=${input.votingWindowHours} quorum_bps=${input.quorumBps}\n` +
      `summary=${input.summary}`,
    calldataPayload: pseudoCalldata(input),
    foundrySimulationCommand:
      `forge test --match-test testProposal_${proposalId.replace(/-/g, "_")} -vvv`,
    constitutionalGate: {
      switchFile: gateFile,
      allowDeploy: false,
      requiresOutcome: "PASSED",
    },
  };
}

export async function writeProposalBundle(
  input: ProposalInput,
  outputDir = "/home/ghost/ghostl-stack/tools/ghostcontrol/governance/proposals",
): Promise<{
  proposalPath: string;
  simulationPath: string;
  gatePath: string;
  bundle: ProposalBundle;
}> {
  const bundle = buildProposal(input);
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.dirname(bundle.constitutionalGate.switchFile), {
    recursive: true,
  });

  const proposalPath = path.join(outputDir, `${bundle.proposalId}.json`);
  await writeFile(proposalPath, JSON.stringify(bundle, null, 2), "utf8");

  const simulationPath = path.join(outputDir, `${bundle.proposalId}.t.sol`);
  const solidity = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProposalSimulation_${bundle.proposalId.replace(/-/g, "_")} {
    function testProposal_${bundle.proposalId.replace(/-/g, "_")}() external pure returns (bytes memory) {
        return hex"${bundle.calldataPayload.replace(/^0x/, "")}";
    }
}
`;
  await writeFile(simulationPath, solidity, "utf8");

  const gatePayload = {
    proposalId: bundle.proposalId,
    allowDeploy: false,
    requiresOutcome: "PASSED",
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    bundle.constitutionalGate.switchFile,
    JSON.stringify(gatePayload, null, 2),
    "utf8",
  );

  return {
    proposalPath,
    simulationPath,
    gatePath: bundle.constitutionalGate.switchFile,
    bundle,
  };
}

