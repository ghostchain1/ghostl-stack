// GhostForge — GhostChain Smart Contract Build Framework
// The GhostChain-native replacement for Hardhat/Foundry CLI.
// Wraps forge + solc with GhostChain-specific defaults: chain IDs, GST gas, ghost_ RPC.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export interface GhostForgeConfig {
  /** Path to foundry.toml — default: ./foundry.toml */
  foundryConfig?: string;
  /** Forge profile to use — default: 'default' */
  profile?: string;
  /** Paths to search in */
  src?: string;
  out?: string;
  lib?: string;
  cwd?: string;
}

export interface GhostBuildResult {
  success: boolean;
  artifacts: string[];
  warnings: string[];
  errors: string[];
  durationMs: number;
}

export interface GhostTestResult {
  passed: number;
  failed: number;
  skipped: number;
  gasReport?: Record<string, number>;
  output: string;
}

export type GhostNetworkName = 'ghostchain-l1' | 'ghostchain-l2' | 'ghostchain-l3' | 'ghostchain-devnet';

export interface GhostDeployConfig {
  network: GhostNetworkName;
  contractName: string;
  constructorArgs?: unknown[];
  value?: bigint;
  gasLimit?: bigint;
  /** Allow gas estimation */
  estimateGas?: boolean;
}

export interface GhostDeployReceipt {
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
  network: GhostNetworkName;
  contractName: string;
  abi: unknown[];
  bytecode: string;
}

/** Canonical GhostChain network configurations */
export const GHOST_NETWORKS: Record<GhostNetworkName, { chainId: number; rpc: string }> = {
  'ghostchain-l1':     { chainId: 14000101, rpc: 'http://localhost:18545' },
  'ghostchain-l2':     { chainId: 901,      rpc: 'http://localhost:29545' },
  'ghostchain-l3':     { chainId: 903,      rpc: 'http://localhost:39545' },
  'ghostchain-devnet': { chainId: 14000101, rpc: 'http://localhost:18545' },
};

/**
 * GhostForge — programmatic API for the GhostChain build toolchain.
 *
 * @example
 * ```ts
 * import { GhostForge } from '@ghostchain/ghostforge';
 *
 * const forge = new GhostForge({ profile: 'default', cwd: './contracts' });
 *
 * const build = await forge.build();
 * console.log(`Built ${build.artifacts.length} artifacts`);
 *
 * const tests = await forge.test({ matchTest: 'testTransfer' });
 * console.log(`Tests: ${tests.passed} passed, ${tests.failed} failed`);
 *
 * const receipt = await forge.deploy({
 *   network: 'ghostchain-l2',
 *   contractName: 'GhostToken',
 *   constructorArgs: ['GhostToken', 'GT', 18],
 * });
 * console.log('Deployed at', receipt.contractAddress);
 * ```
 */
export class GhostForge {
  private readonly config: GhostForgeConfig;
  private readonly cwd: string;

  constructor(config: GhostForgeConfig = {}) {
    this.config = config;
    this.cwd = config.cwd ? resolve(config.cwd) : process.cwd();
  }

  /** Compile all contracts via forge build */
  async build(opts: { skipTests?: boolean; force?: boolean } = {}): Promise<GhostBuildResult> {
    const args = ['build'];
    if (opts.skipTests) args.push('--skip', 'test');
    if (opts.force)     args.push('--force');
    if (this.config.profile) args.push('--profile', this.config.profile);

    const start = Date.now();
    try {
      const { stdout, stderr } = await execFileAsync('forge', args, {
        cwd: this.cwd,
        env: { ...process.env, FOUNDRY_PROFILE: this.config.profile ?? 'default' },
        maxBuffer: 64 * 1024 * 1024,
      });

      return {
        success: true,
        artifacts: this._parseArtifacts(stdout),
        warnings: this._parseWarnings(stderr),
        errors: [],
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const error = err as { stderr?: string; stdout?: string; message?: string };
      return {
        success: false,
        artifacts: [],
        warnings: [],
        errors: [error.stderr ?? error.message ?? String(error)],
        durationMs: Date.now() - start,
      };
    }
  }

  /** Run forge tests */
  async test(opts: {
    matchTest?: string;
    matchContract?: string;
    gasReport?: boolean;
    fuzz?: boolean;
    fuzzRuns?: number;
    verbosity?: 1 | 2 | 3 | 4 | 5;
  } = {}): Promise<GhostTestResult> {
    const args = ['test'];
    if (opts.matchTest)     args.push('--match-test',     opts.matchTest);
    if (opts.matchContract) args.push('--match-contract', opts.matchContract);
    if (opts.gasReport)     args.push('--gas-report');
    if (opts.fuzzRuns)      args.push('--fuzz-runs',      String(opts.fuzzRuns));
    if (opts.verbosity)     args.push(`-${'v'.repeat(opts.verbosity)}`);
    if (this.config.profile) args.push('--profile', this.config.profile);

    try {
      const { stdout } = await execFileAsync('forge', args, {
        cwd: this.cwd,
        env: { ...process.env, FOUNDRY_PROFILE: this.config.profile ?? 'default' },
        maxBuffer: 64 * 1024 * 1024,
      });

      return this._parseTestOutput(stdout);
    } catch (err: unknown) {
      const error = err as { stdout?: string };
      return this._parseTestOutput(error.stdout ?? '');
    }
  }

  /** Read compiled ABI for a contract */
  async getABI(contractName: string): Promise<unknown[]> {
    const outDir = this.config.out ?? 'out';
    const artifactPath = join(this.cwd, outDir, `${contractName}.sol`, `${contractName}.json`);
    const raw = await readFile(artifactPath, 'utf-8');
    const artifact = JSON.parse(raw) as { abi: unknown[] };
    return artifact.abi;
  }

  /** Get deployed bytecode for a contract */
  async getBytecode(contractName: string): Promise<string> {
    const outDir = this.config.out ?? 'out';
    const artifactPath = join(this.cwd, outDir, `${contractName}.sol`, `${contractName}.json`);
    const raw = await readFile(artifactPath, 'utf-8');
    const artifact = JSON.parse(raw) as { bytecode: { object: string } };
    return artifact.bytecode.object;
  }

  /** Deploy a contract via forge create */
  async deploy(deployConfig: GhostDeployConfig, privateKey: string): Promise<GhostDeployReceipt> {
    const network = GHOST_NETWORKS[deployConfig.network];
    if (!network) throw new Error(`GhostForge: unknown network '${deployConfig.network}'`);

    const args = [
      'create',
      deployConfig.contractName,
      '--rpc-url',  network.rpc,
      '--private-key', privateKey,
      '--json',
    ];

    if (deployConfig.constructorArgs?.length) {
      args.push('--constructor-args', ...deployConfig.constructorArgs.map(String));
    }
    if (deployConfig.value) args.push('--value', deployConfig.value.toString());

    const { stdout } = await execFileAsync('forge', args, {
      cwd: this.cwd,
      env: { ...process.env, FOUNDRY_PROFILE: this.config.profile ?? 'default' },
      maxBuffer: 16 * 1024 * 1024,
    });

    const result = JSON.parse(stdout) as {
      deployedTo: string;
      transactionHash: string;
      blockNumber: number;
      gasUsed: string;
    };

    const abi = await this.getABI(deployConfig.contractName).catch(() => []);
    const bytecode = await this.getBytecode(deployConfig.contractName).catch(() => '');

    return {
      contractAddress: result.deployedTo,
      txHash:          result.transactionHash,
      blockNumber:     result.blockNumber,
      gasUsed:         BigInt(result.gasUsed ?? 0),
      network:         deployConfig.network,
      contractName:    deployConfig.contractName,
      abi,
      bytecode,
    };
  }

  /** Verify a contract via forge verify-contract */
  async verify(params: {
    address: string;
    contractName: string;
    network: GhostNetworkName;
    constructorArgs?: string;
  }): Promise<void> {
    const network = GHOST_NETWORKS[params.network];
    const args = [
      'verify-contract',
      params.address,
      params.contractName,
      '--rpc-url', network.rpc,
    ];
    if (params.constructorArgs) args.push('--constructor-args', params.constructorArgs);

    await execFileAsync('forge', args, { cwd: this.cwd });
  }

  /** Write a foundry.toml for GhostChain — idiomatic defaults */
  async generateFoundryToml(): Promise<void> {
    const toml = `
[profile.default]
src            = "src"
out            = "out"
libs           = ["lib"]
via_ir         = true
optimizer      = true
optimizer_runs = 200
solc_version   = "0.8.24"
remappings     = [
  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
]

[profile.legacy]
evm_version    = "paris"
via_ir         = false

[profile.gns]
test           = "test/gns"

[profile.ai]
test           = "test/ai"

[profile.exchange]
test           = "test/exchange"

[fuzz]
runs = 256

[invariant]
runs = 64
`.trimStart();

    await writeFile(join(this.cwd, 'foundry.toml'), toml, 'utf-8');
    console.log('[GhostForge] foundry.toml generated');
  }

  /** Scaffold a new GhostChain contract project */
  async scaffold(projectName: string): Promise<void> {
    const projectDir = join(this.cwd, projectName);
    await mkdir(projectDir, { recursive: true });
    await mkdir(join(projectDir, 'src'), { recursive: true });
    await mkdir(join(projectDir, 'test', 'foundry'), { recursive: true });
    await mkdir(join(projectDir, 'script'), { recursive: true });

    await writeFile(join(projectDir, 'src', `${projectName}.sol`), solTemplate(projectName), 'utf-8');
    await new GhostForge({ cwd: projectDir }).generateFoundryToml();
    console.log(`[GhostForge] Scaffolded ${projectName} at ${projectDir}`);
  }

  private _parseArtifacts(stdout: string): string[] {
    return [...stdout.matchAll(/compiled ([\w/]+\.sol)/gi)].map(m => m[1]);
  }

  private _parseWarnings(stderr: string): string[] {
    return stderr.split('\n').filter(l => l.toLowerCase().includes('warning'));
  }

  private _parseTestOutput(output: string): GhostTestResult {
    const passedMatch = output.match(/(\d+)\s+tests?\s+passed/i);
    const failedMatch = output.match(/(\d+)\s+failed/i);
    return {
      passed: passedMatch ? Number(passedMatch[1]) : 0,
      failed: failedMatch ? Number(failedMatch[1]) : 0,
      skipped: 0,
      output,
    };
  }
}

function solTemplate(name: string): string {
  return `// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (src/${name}.sol)
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../ghost/GhostBrand.sol";

contract ${name} is GhostBrand, Ownable {
    constructor(address initialOwner) Ownable(initialOwner) {}
}
`;
}

export { GhostForge as default };
