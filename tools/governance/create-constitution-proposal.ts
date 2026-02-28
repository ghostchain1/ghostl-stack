/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Interface, keccak256, toUtf8Bytes } from "ethers";

type CliArgs = {
  proposalId: string;
  releaseId: string;
  releaseGateAddress: string;
  manifestPath: string;
  constitutionPath: string;
  signaturePath: string;
  timelockExpiresAt: string;
  outputPath: string;
};

const DEFAULTS: Omit<CliArgs, "proposalId" | "releaseId" | "releaseGateAddress"> = {
  manifestPath: "artifacts/release/release_manifest.json",
  constitutionPath: "docs/constitution/GhostChain-Constitution.md",
  signaturePath: "artifacts/release/release_manifest.sig",
  timelockExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  outputPath: "artifacts/release/constitution-proposal.json"
};

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--proposal-id":
        out.proposalId = value;
        i += 1;
        break;
      case "--release-id":
        out.releaseId = value;
        i += 1;
        break;
      case "--release-gate":
        out.releaseGateAddress = value;
        i += 1;
        break;
      case "--manifest":
        out.manifestPath = value;
        i += 1;
        break;
      case "--constitution":
        out.constitutionPath = value;
        i += 1;
        break;
      case "--signature":
        out.signaturePath = value;
        i += 1;
        break;
      case "--timelock-expires-at":
        out.timelockExpiresAt = value;
        i += 1;
        break;
      case "--out":
        out.outputPath = value;
        i += 1;
        break;
      default:
        throw new Error(`unknown argument: ${key}`);
    }
  }

  if (!out.proposalId) throw new Error("missing --proposal-id");
  if (!out.releaseId) throw new Error("missing --release-id");
  if (!out.releaseGateAddress) throw new Error("missing --release-gate");

  return {
    proposalId: out.proposalId,
    releaseId: out.releaseId,
    releaseGateAddress: out.releaseGateAddress,
    manifestPath: out.manifestPath || DEFAULTS.manifestPath,
    constitutionPath: out.constitutionPath || DEFAULTS.constitutionPath,
    signaturePath: out.signaturePath || DEFAULTS.signaturePath,
    timelockExpiresAt: out.timelockExpiresAt || DEFAULTS.timelockExpiresAt,
    outputPath: out.outputPath || DEFAULTS.outputPath
  };
}

function sha256Hex(filePath: string): string {
  const raw = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function ensureBytes32FromSha256(filePath: string): `0x${string}` {
  return `0x${sha256Hex(filePath)}`;
}

function ensureUnixTimestamp(iso: string): number {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) throw new Error(`invalid timestamp: ${iso}`);
  return Math.floor(parsed / 1000);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const root = process.cwd();
  const manifestPath = path.resolve(root, args.manifestPath);
  const constitutionPath = path.resolve(root, args.constitutionPath);
  const signaturePath = path.resolve(root, args.signaturePath);
  const outputPath = path.resolve(root, args.outputPath);

  for (const requiredPath of [manifestPath, constitutionPath, signaturePath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`missing file: ${requiredPath}`);
    }
  }

  const manifestHash = ensureBytes32FromSha256(manifestPath);
  const constitutionHash = ensureBytes32FromSha256(constitutionPath);
  const attestationHash = ensureBytes32FromSha256(signaturePath);
  const proposalIdHash = keccak256(toUtf8Bytes(args.proposalId));
  const releaseIdHash = keccak256(toUtf8Bytes(args.releaseId));
  const timelockExpiresAt = ensureUnixTimestamp(args.timelockExpiresAt);

  const iface = new Interface([
    "function setConstitutionHash(bytes32 constitutionHash,bool approved)",
    "function setReleaseManifestHash(bytes32 releaseManifestHash,bool approved)",
    "function setProposalIdHash(bytes32 proposalIdHash,bool approved)",
    "function setAttestationHash(bytes32 attestationHash,bool approved)",
    "function configureLaunch((bytes32 releaseId,bytes32 manifestHash,bytes32 constitutionHash,bytes32 releaseManifestHash,bytes32 proposalIdHash,bytes32 attestationHash,uint64 timelockExpiresAt,bool attestationRequired) next)"
  ]);

  const calldata = {
    setConstitutionHash: iface.encodeFunctionData("setConstitutionHash", [constitutionHash, true]),
    setReleaseManifestHash: iface.encodeFunctionData("setReleaseManifestHash", [manifestHash, true]),
    setProposalIdHash: iface.encodeFunctionData("setProposalIdHash", [proposalIdHash, true]),
    setAttestationHash: iface.encodeFunctionData("setAttestationHash", [attestationHash, true]),
    configureLaunch: iface.encodeFunctionData("configureLaunch", [
      {
        releaseId: releaseIdHash,
        manifestHash,
        constitutionHash,
        releaseManifestHash: manifestHash,
        proposalIdHash,
        attestationHash,
        timelockExpiresAt,
        attestationRequired: true
      }
    ])
  };

  const bundle = {
    proposalId: args.proposalId,
    releaseId: args.releaseId,
    releaseGateAddress: args.releaseGateAddress,
    generatedAt: new Date().toISOString(),
    hashes: {
      releaseIdHash,
      manifestHash,
      constitutionHash,
      proposalIdHash,
      attestationHash
    },
    timelockExpiresAt,
    calldata
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");

  console.log(`constitution_proposal_bundle:${outputPath}`);
}

main();
