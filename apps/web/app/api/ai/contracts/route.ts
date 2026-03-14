import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type LayerKey = 'l1' | 'l2' | 'l3';

type ContractKey =
  | 'AIOracleRegistry'
  | 'AIAttestationHub'
  | 'PolicyGuard'
  | 'EvidenceAnchor'
  | 'AIAttestationTypes'
  | 'IRiskScoringHook';

type DeploymentAddresses = Record<LayerKey, Partial<Record<ContractKey, string>>>;

type AbiBundle = Partial<Record<ContractKey, unknown[]>>;

const contractNames: ContractKey[] = [
  'AIOracleRegistry',
  'AIAttestationHub',
  'PolicyGuard',
  'EvidenceAnchor',
  'AIAttestationTypes',
  'IRiskScoringHook'
];

const layerFromFile = (file: string): LayerKey | null => {
  const base = file.replace(/\.json$/i, '').toLowerCase();
  if (base === 'l1' || base === 'l2' || base === 'l3') return base;
  return null;
};

const resolveRepoRoot = () => {
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(current, 'contracts'))) return current;
    const parent = path.resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
};

const findArtifactPath = (artifactsRoot: string, contractName: string) => {
  if (!fs.existsSync(artifactsRoot)) return null;
  const stack = [artifactsRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === `${contractName}.json`) {
        return fullPath;
      }
    }
  }
  return null;
};

const readArtifactAbi = (artifactsRoot: string, contractName: string) => {
  const artifactPath = findArtifactPath(artifactsRoot, contractName);
  if (!artifactPath) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { abi?: unknown };
    if (Array.isArray(parsed.abi)) return parsed.abi as unknown[];
  } catch {
    return null;
  }
  return null;
};

const readDeploymentAddresses = (deploymentsRoot: string): DeploymentAddresses => {
  const addresses: DeploymentAddresses = { l1: {}, l2: {}, l3: {} };
  if (!fs.existsSync(deploymentsRoot)) return addresses;

  const networks = fs.readdirSync(deploymentsRoot, { withFileTypes: true });
  for (const networkEntry of networks) {
    if (!networkEntry.isDirectory()) continue;
    const networkDir = path.join(deploymentsRoot, networkEntry.name);
    const files = fs.readdirSync(networkDir, { withFileTypes: true });
    for (const fileEntry of files) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('.json')) continue;
      const layer = layerFromFile(fileEntry.name);
      if (!layer) continue;
      const filePath = path.join(networkDir, fileEntry.name);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as { contracts?: Array<{ name?: string; address?: string }> };
        const contracts = Array.isArray(parsed.contracts) ? parsed.contracts : [];
        for (const contract of contracts) {
          const name = contract?.name as ContractKey | undefined;
          const address = typeof contract?.address === 'string' ? contract.address : '';
          if (!name || !contractNames.includes(name) || !address) continue;
          addresses[layer][name] = address;
        }
      } catch {
        continue;
      }
    }
  }

  return addresses;
};

export async function GET() {
  const repoRoot = resolveRepoRoot();
  const contractsRoot = path.join(repoRoot, 'contracts');
  const artifactsRoot = path.join(contractsRoot, 'artifacts', 'src');
  const deploymentsRoot = path.join(contractsRoot, 'deployments');

  const abis: AbiBundle = {};
  for (const contractName of contractNames) {
    const abi = readArtifactAbi(artifactsRoot, contractName);
    if (abi && abi.length > 0) {
      abis[contractName] = abi;
    }
  }

  const addresses = readDeploymentAddresses(deploymentsRoot);

  return NextResponse.json({
    ok: true,
    artifactsRoot,
    abis,
    addresses
  });
}
