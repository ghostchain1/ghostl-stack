import fs from 'fs';
import path from 'path';

export type RegisteredContract = {
  name: string;
  address: string;
  chainId: number;
  layer: 'l1' | 'l2' | 'l3';
  abi: unknown;
  abiHash: string;
  version: string;
  deployedAt?: string;
};

const dataDir = process.env.DATA_DIR || 'data';
const registryPath = path.join(dataDir, 'contracts-registry.json');
const ensureDir = () => {
  fs.mkdirSync(dataDir, { recursive: true });
};

const load = (): RegisteredContract[] => {
  if (!fs.existsSync(registryPath)) return [];
  const raw = fs.readFileSync(registryPath, 'utf8');
  try {
    const parsed = JSON.parse(raw) as RegisteredContract[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (contracts: RegisteredContract[]) => {
  ensureDir();
  fs.writeFileSync(registryPath, JSON.stringify(contracts, null, 2));
};

export const listContracts = () => load();

export const registerContracts = (incoming: RegisteredContract[]) => {
  const existing = load();
  const next = [...existing];
  incoming.forEach((entry) => {
    const idx = next.findIndex(
      (item) => item.address.toLowerCase() === entry.address.toLowerCase() && item.chainId === entry.chainId
    );
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...entry };
    } else {
      next.push(entry);
    }
  });
  save(next);
  return next;
};
