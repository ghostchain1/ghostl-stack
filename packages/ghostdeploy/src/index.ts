// GhostDeploy — GhostChain Contract Deployment Engine
// Tracks deployed addresses across layers, generates manifests, supports upgrades.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type GhostDeployNetwork = 'ghostchain-l1' | 'ghostchain-l2' | 'ghostchain-l3' | 'ghostchain-devnet';

export const GHOST_DEPLOY_NETWORKS: Record<GhostDeployNetwork, { chainId: number; rpc: string }> = {
  'ghostchain-l1':     { chainId: 14000101, rpc: 'http://localhost:18545' },
  'ghostchain-l2':     { chainId: 901,      rpc: 'http://localhost:7260' },
  'ghostchain-l3':     { chainId: 903,      rpc: 'http://localhost:7270' },
  'ghostchain-devnet': { chainId: 14000101, rpc: 'http://localhost:18545' },
};

export interface GhostDeployEntry {
  contract: string;
  address: string;
  txHash: string;
  blockNumber: number;
  network: GhostDeployNetwork;
  chainId: number;
  deployer: string;
  constructorArgs: unknown[];
  deployedAt: string; // ISO timestamp
  abi?: unknown[];
}

export interface GhostDeployManifest {
  version: number;
  deployments: GhostDeployEntry[];
}

export interface GhostDeployParams {
  network: GhostDeployNetwork;
  contract: string;
  abi: unknown[];
  bytecode: string;
  constructorArgs?: unknown[];
  privateKey: string;
  value?: bigint;
  gasLimit?: bigint;
}

/**
 * GhostDeploy — tracks and executes GhostChain contract deployments.
 * Writes a JSON manifest to `deployments/<network>.json` after each deployment.
 *
 * @example
 * ```ts
 * import { GhostDeploy } from '@ghostchain/ghostdeploy';
 *
 * const deployer = new GhostDeploy({ manifestDir: './deployments' });
 *
 * const entry = await deployer.deploy({
 *   network: 'ghostchain-l2',
 *   contract: 'GhostToken',
 *   abi, bytecode,
 *   constructorArgs: ['GhostToken', 'GT', 18],
 *   privateKey: process.env.DEPLOY_PK!,
 * });
 *
 * console.log('Deployed GhostToken at', entry.address);
 * ```
 */
export class GhostDeploy {
  private readonly manifestDir: string;

  constructor(opts: { manifestDir?: string } = {}) {
    this.manifestDir = opts.manifestDir ? resolve(opts.manifestDir) : resolve('./deployments');
  }

  /** Deploy a contract and record the result in the manifest */
  async deploy(params: GhostDeployParams): Promise<GhostDeployEntry> {
    const network = GHOST_DEPLOY_NETWORKS[params.network];
    if (!network) throw new Error(`GhostDeploy: unknown network '${params.network}'`);

    const { address, txHash, blockNumber, deployer } = await this._sendDeployTx(params, network);

    const entry: GhostDeployEntry = {
      contract:        params.contract,
      address,
      txHash,
      blockNumber,
      network:         params.network,
      chainId:         network.chainId,
      deployer,
      constructorArgs: params.constructorArgs ?? [],
      deployedAt:      new Date().toISOString(),
      abi:             params.abi,
    };

    await this._appendToManifest(params.network, entry);
    return entry;
  }

  /** Get all deployments for a network from the manifest */
  async getDeployments(network: GhostDeployNetwork): Promise<GhostDeployEntry[]> {
    const manifest = await this._readManifest(network);
    return manifest.deployments;
  }

  /** Look up the most recent deployment of a contract on a network */
  async getLatest(network: GhostDeployNetwork, contractName: string): Promise<GhostDeployEntry | undefined> {
    const deployments = await this.getDeployments(network);
    return deployments.filter(d => d.contract === contractName).at(-1);
  }

  /** Require a contract to be deployed — throws if not found */
  async require(network: GhostDeployNetwork, contractName: string): Promise<GhostDeployEntry> {
    const entry = await this.getLatest(network, contractName);
    if (!entry) throw new Error(`GhostDeploy: ${contractName} not deployed on ${network}`);
    return entry;
  }

  /** Print a deployment summary table */
  async printSummary(network: GhostDeployNetwork): Promise<void> {
    const deployments = await this.getDeployments(network);
    console.log(`\n[GhostDeploy] ${network} deployments:`);
    for (const d of deployments) {
      console.log(`  ${d.contract.padEnd(30)} ${d.address}  (${d.deployedAt})`);
    }
  }

  private async _sendDeployTx(params: GhostDeployParams, network: { rpc: string }): Promise<{
    address: string;
    txHash: string;
    blockNumber: number;
    deployer: string;
  }> {
    // Encode deployment calldata = bytecode + ABI-encoded constructor args
    const calldata = params.constructorArgs?.length
      ? params.bytecode + encodeConstructorArgs(params.abi, params.constructorArgs)
      : params.bytecode;

    // Derive deployer address from private key (simplified — real impl uses secp256k1)
    const deployer = await this._deriveAddress(params.privateKey, network.rpc);

    const nonce = await this._rpcCall<string>(network.rpc, 'ghost_getTransactionCount', [deployer, 'pending']);
    const gasPrice = await this._rpcCall<string>(network.rpc, 'ghost_gasPrice', []);

    const rawTx = buildDeployTx({
      nonce: parseInt(nonce, 16),
      gasPrice: parseInt(gasPrice, 16),
      gasLimit: params.gasLimit ?? 3_000_000n,
      value: params.value ?? 0n,
      data: calldata,
      privateKey: params.privateKey,
    });

    const txHash = await this._rpcCall<string>(network.rpc, 'ghost_sendRawTransaction', [rawTx]);
    const receipt = await this._waitForReceipt(network.rpc, txHash);

    return {
      address:     receipt.contractAddress,
      txHash,
      blockNumber: parseInt(receipt.blockNumber, 16),
      deployer,
    };
  }

  private async _waitForReceipt(rpc: string, txHash: string, attempts = 60): Promise<{
    contractAddress: string;
    blockNumber: string;
    status: string;
  }> {
    for (let i = 0; i < attempts; i++) {
      const receipt = await this._rpcCall<{ contractAddress: string; blockNumber: string; status: string } | null>(
        rpc, 'ghost_getTransactionReceipt', [txHash]
      );
      if (receipt) {
        if (receipt.status === '0x0') throw new Error(`GhostDeploy: transaction failed (${txHash})`);
        return receipt;
      }
      await sleep(2000);
    }
    throw new Error(`GhostDeploy: timed out waiting for receipt (${txHash})`);
  }

  private async _deriveAddress(privateKey: string, rpc: string): Promise<string> {
    // Derive address via node (avoids shipping secp256k1 in SDK)
    const accounts = await this._rpcCall<string[]>(rpc, 'ghost_accounts', []);
    // In production, derive from PK via secp256k1 keccak256 slice
    return accounts[0] ?? '0x0000000000000000000000000000000000000000';
  }

  private async _rpcCall<T>(rpc: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`GhostDeploy RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostDeploy [${method}]: ${json.error.message}`);
    return json.result as T;
  }

  private async _readManifest(network: GhostDeployNetwork): Promise<GhostDeployManifest> {
    const path = `${this.manifestDir}/${network}.json`;
    try {
      const raw = await readFile(path, 'utf-8');
      return JSON.parse(raw) as GhostDeployManifest;
    } catch {
      return { version: 1, deployments: [] };
    }
  }

  private async _appendToManifest(network: GhostDeployNetwork, entry: GhostDeployEntry): Promise<void> {
    const manifest = await this._readManifest(network);
    manifest.deployments.push(entry);
    const path = `${this.manifestDir}/${network}.json`;
    await writeFile(path, JSON.stringify(manifest, null, 2), 'utf-8');
  }
}

// Simplified stubs — real implementation uses secp256k1 + RLP encoding
function encodeConstructorArgs(_abi: unknown[], _args: unknown[]): string {
  return '';
}

function buildDeployTx(_params: {
  nonce: number;
  gasPrice: number;
  gasLimit: bigint;
  value: bigint;
  data: string;
  privateKey: string;
}): string {
  // In production: use ghost-sdk-core for RLP encoding + secp256k1 signing
  return '0x';
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export default GhostDeploy;
