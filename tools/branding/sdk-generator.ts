#!/usr/bin/env node
/**
 * @file tools/branding/sdk-generator.ts
 * @description GhostChain SDK Branding Generator.
 *
 * Audits the ghost-sdk package for required Ghost* canonical entry points
 * and generates stub files for any that are missing.
 *
 * Required Ghost* surface (must exist as named exports in the SDK index):
 *   GhostProvider      — replaces JsonRpcProvider / ethers.Provider
 *   GhostWallet        — replaces ethers.Wallet / Signer
 *   GhostContract      — replaces ethers.Contract
 *   GhostTransaction   — canonical tx builder/parser
 *   GhostGasEngine     — fee estimation (bridges to gas-engine service)
 *   GhostJsonRpc       — eth_→ghost_ RPC proxy
 *
 * Non-destructive: existing files are never overwritten.
 *
 * Run:
 *   node --experimental-strip-types tools/branding/sdk-generator.ts
 *   node --experimental-strip-types tools/branding/sdk-generator.ts --check
 *   pnpm brand:sdk
 *
 * Exit codes:
 *   0  All required exports exist (or stubs generated successfully)
 *   1  Missing exports found in --check mode
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SDK_SRC = path.join(ROOT, "packages/ghost-sdk/src");
const SDK_INDEX = path.join(SDK_SRC, "index.ts");

const CHECK_ONLY = process.argv.includes("--check");

// ---------------------------------------------------------------------------
// Required Ghost* canonical exports
// ---------------------------------------------------------------------------

interface RequiredExport {
  name: string;
  file: string;
  description: string;
  stub: string;
}

const REQUIRED_EXPORTS: RequiredExport[] = [
  {
    name: "GhostProvider",
    file: "GhostProvider.ts",
    description: "Canonical JsonRpc provider for GhostChain — replaces ethers.JsonRpcProvider",
    stub: `/**
 * @file GhostProvider.ts
 * @description GhostChain canonical JSON-RPC provider.
 * Wraps the ghost-sdk-core provider with GhostChain chain defaults.
 *
 * GhostChain RPC Endpoints:
 *   L1: https://rpc.ghostchain.cloud
 *   L2: https://l2rpc.ghostchain.cloud
 *   L3: https://l3rpc.ghostchain.cloud
 *
 * @example
 *   const provider = new GhostProvider("https://rpc.ghostchain.cloud");
 *   const balance = await provider.getGstBalance(address);
 */

export class GhostProvider {
  readonly rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async getGstBalance(address: string): Promise<bigint> {
    // TODO: implement via ghost_getBalance RPC call
    throw new Error("GhostProvider.getGstBalance: not yet implemented");
  }

  async getBlockNumber(): Promise<number> {
    // TODO: implement via ghost_blockNumber
    throw new Error("GhostProvider.getBlockNumber: not yet implemented");
  }

  async call(tx: { to: string; data: string }): Promise<string> {
    // TODO: implement via ghost_call
    throw new Error("GhostProvider.call: not yet implemented");
  }
}
`,
  },
  {
    name: "GhostWallet",
    file: "GhostWallet.ts",
    description: "Canonical GhostChain wallet/signer — replaces ethers.Wallet",
    stub: `/**
 * @file GhostWallet.ts
 * @description GhostChain canonical wallet and transaction signer.
 * Replaces ethers.Wallet in GhostStack consumer code.
 *
 * @example
 *   const wallet = GhostWallet.fromPrivateKey(privateKey, provider);
 *   const tx = await wallet.sendGst(recipient, amount);
 */

import type { GhostProvider } from "./GhostProvider.js";

export class GhostWallet {
  readonly address: string;
  readonly provider: GhostProvider | undefined;

  private constructor(address: string, provider?: GhostProvider) {
    this.address = address;
    this.provider = provider;
  }

  static fromPrivateKey(privateKey: string, provider?: GhostProvider): GhostWallet {
    // TODO: derive address from private key via ghost-sdk-core/accounts
    throw new Error("GhostWallet.fromPrivateKey: not yet implemented");
  }

  static fromMnemonic(mnemonic: string, provider?: GhostProvider): GhostWallet {
    throw new Error("GhostWallet.fromMnemonic: not yet implemented");
  }

  connect(provider: GhostProvider): GhostWallet {
    return new GhostWallet(this.address, provider);
  }

  async sendGst(to: string, amount: bigint): Promise<string> {
    // TODO: sign and broadcast via ghost_sendRawTransaction
    throw new Error("GhostWallet.sendGst: not yet implemented");
  }

  async signMessage(message: string): Promise<string> {
    throw new Error("GhostWallet.signMessage: not yet implemented");
  }
}
`,
  },
  {
    name: "GhostContract",
    file: "GhostContract.ts",
    description: "Ghost-branded contract interaction wrapper — replaces ethers.Contract",
    stub: `/**
 * @file GhostContract.ts
 * @description GhostChain smart contract interaction wrapper.
 * Replaces ethers.Contract in GhostStack consumer code.
 *
 * @example
 *   const token = new GhostContract(GST_ADDRESS, ERC20_ABI, wallet);
 *   const balance = await token.call("balanceOf", [address]);
 */

import type { GhostProvider } from "./GhostProvider.js";
import type { GhostWallet } from "./GhostWallet.js";

type AbiFragment = Record<string, unknown>;

export class GhostContract {
  readonly address: string;
  readonly abi: readonly AbiFragment[];
  readonly signerOrProvider: GhostWallet | GhostProvider;

  constructor(
    address: string,
    abi: readonly AbiFragment[],
    signerOrProvider: GhostWallet | GhostProvider
  ) {
    this.address = address;
    this.abi = abi;
    this.signerOrProvider = signerOrProvider;
  }

  async call(method: string, args: unknown[] = []): Promise<unknown> {
    // TODO: encode calldata and call via GhostProvider
    throw new Error(\`GhostContract.call(\${method}): not yet implemented\`);
  }

  async send(method: string, args: unknown[] = []): Promise<string> {
    // TODO: encode calldata and send via GhostWallet
    throw new Error(\`GhostContract.send(\${method}): not yet implemented\`);
  }
}
`,
  },
  {
    name: "GhostTransaction",
    file: "GhostTransaction.ts",
    description: "Canonical GhostChain transaction builder and parser",
    stub: `/**
 * @file GhostTransaction.ts
 * @description GhostChain canonical transaction type.
 * Replaces ethers.TransactionRequest / TransactionResponse.
 *
 * GhostChain L1 chain ID:  14000101
 * GhostChain L2 chain ID:  901
 * GhostChain L3 chain ID:  903
 */

export const GHOST_CHAIN_IDS = {
  L1: 14000101,
  L2: 901,
  L3: 903,
} as const;

export interface GhostTransactionRequest {
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId?: number;
}

export interface GhostTransactionResponse {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  gasUsed: bigint;
  blockNumber: number | null;
  confirms: number;
  timestamp: number | null;
}

export class GhostTransaction {
  static buildRequest(params: GhostTransactionRequest): GhostTransactionRequest {
    return {
      chainId: GHOST_CHAIN_IDS.L1,
      ...params,
    };
  }

  static parseHash(hash: string): string {
    if (!hash.startsWith("0x") || hash.length !== 66) {
      throw new Error(\`Invalid GhostChain tx hash: \${hash}\`);
    }
    return hash;
  }
}
`,
  },
  {
    name: "GhostGasEngine",
    file: "GhostGasEngine.ts",
    description: "GhostChain gas estimation — bridges to ghost-gas-engine service",
    stub: `/**
 * @file GhostGasEngine.ts
 * @description GhostChain gas estimation and fee management.
 * Connects to the ghost-gas-engine service for dynamic fee computation.
 *
 * GST unit: 1e18 (same decimal precision as GST token)
 */

export const GST_UNIT = BigInt("1000000000000000000"); // 1 GST

export class GhostGasEngine {
  readonly gasEngineUrl: string;

  constructor(gasEngineUrl = "http://ghost-gas-engine:4040") {
    this.gasEngineUrl = gasEngineUrl;
  }

  async estimateGas(tx: { to: string; data: string; value?: bigint }): Promise<bigint> {
    // TODO: call ghost-gas-engine /estimate endpoint
    throw new Error("GhostGasEngine.estimateGas: not yet implemented");
  }

  async getBaseFeePerGas(): Promise<bigint> {
    // TODO: call ghost-gas-engine /basefee endpoint
    throw new Error("GhostGasEngine.getBaseFeePerGas: not yet implemented");
  }

  /** Convert GST wei amount to human-readable GST string */
  static formatGst(wei: bigint): string {
    const whole = wei / GST_UNIT;
    const frac = wei % GST_UNIT;
    return frac === 0n ? \`\${whole} GST\` : \`\${whole}.\${frac.toString().padStart(18, "0").replace(/0+$/, "")} GST\`;
  }

  /** Parse human-readable GST string to wei bigint */
  static parseGst(gst: string): bigint {
    const [whole, frac = ""] = gst.replace(/\\s*GST$/i, "").split(".");
    const fracPadded = frac.slice(0, 18).padEnd(18, "0");
    return BigInt(whole) * GST_UNIT + BigInt(fracPadded);
  }
}
`,
  },
  {
    name: "GhostJsonRpc",
    file: "GhostJsonRpc.ts",
    description: "GhostChain JSON-RPC client using ghost_ namespace instead of eth_",
    stub: `/**
 * @file GhostJsonRpc.ts
 * @description GhostChain JSON-RPC 2.0 client.
 * Uses the ghost_ RPC namespace — never eth_.
 *
 * GhostChain RPC methods map:
 *   ghost_getBalance          ← replaces eth_getBalance
 *   ghost_blockNumber         ← replaces eth_blockNumber
 *   ghost_call                ← replaces eth_call
 *   ghost_sendRawTransaction  ← replaces eth_sendRawTransaction
 *   ghost_chainId             ← replaces eth_chainId
 */

export class GhostJsonRpc {
  readonly url: string;
  private _id = 1;

  constructor(url: string) {
    this.url = url;
  }

  async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (method.startsWith("eth_")) {
      throw new Error(
        \`[GhostJsonRpc] Forbidden eth_ method: "\${method}". Use ghost_ namespace.\`
      );
    }

    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this._id++, method, params }),
    });

    if (!res.ok) throw new Error(\`RPC HTTP \${res.status}: \${await res.text()}\`);

    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(\`RPC error: \${json.error.message}\`);
    return json.result as T;
  }

  // ─── Convenience methods ─────────────────────────────────────────────────

  getBalance(address: string, block = "latest"): Promise<string> {
    return this.request("ghost_getBalance", [address, block]);
  }

  getBlockNumber(): Promise<string> {
    return this.request("ghost_blockNumber");
  }

  call(tx: { to: string; data: string }, block = "latest"): Promise<string> {
    return this.request("ghost_call", [tx, block]);
  }

  sendRawTransaction(signedTx: string): Promise<string> {
    return this.request("ghost_sendRawTransaction", [signedTx]);
  }

  getChainId(): Promise<string> {
    return this.request("ghost_chainId");
  }
}
`,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIndexExports(indexPath: string): Set<string> {
  const exports = new Set<string>();
  if (!fs.existsSync(indexPath)) return exports;

  const content = fs.readFileSync(indexPath, "utf8");
  // Match: export { X }, export class X, export function X, export type X, export const X
  const matches = content.matchAll(/\bexport\s+(?:class|function|type|const|interface|abstract class)\s+(\w+)/g);
  for (const m of matches) exports.add(m[1]);
  // Match: export { X, Y } from ...
  const reExportMatches = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const m of reExportMatches) {
    for (const name of m[1].split(",")) {
      exports.add(name.trim().split(/\s+as\s+/)[1]?.trim() ?? name.trim());
    }
  }
  return exports;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  if (!fs.existsSync(SDK_SRC)) {
    process.stderr.write(`ghost-sdk src not found: ${SDK_SRC}\n`);
    process.exit(2);
  }

  const GRN  = "\x1b[32m";
  const YLW  = "\x1b[33m";
  const GRY  = "\x1b[90m";
  const BOLD = "\x1b[1m";
  const RESET= "\x1b[0m";

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   GhostChain SDK Branding Generator                  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const indexExports = getIndexExports(SDK_INDEX);
  const missing: RequiredExport[] = [];
  const present: RequiredExport[] = [];

  for (const req of REQUIRED_EXPORTS) {
    const targetFile = path.join(SDK_SRC, req.file);
    const existsOnDisk = fs.existsSync(targetFile);
    const exportedFromIndex = indexExports.has(req.name);

    if (existsOnDisk && exportedFromIndex) {
      present.push(req);
    } else {
      missing.push(req);
    }
  }

  // Print status
  for (const p of present) {
    console.log(`  ${GRN}✔${RESET}  ${BOLD}${p.name}${RESET}  ${GRY}${p.description}${RESET}`);
  }

  if (missing.length === 0) {
    console.log(`\n${GRN}✔  All ${REQUIRED_EXPORTS.length} Ghost* SDK exports are present.${RESET}\n`);
    process.exit(0);
  }

  console.log();
  for (const m of missing) {
    const targetFile = path.join(SDK_SRC, m.file);
    const existsOnDisk = fs.existsSync(targetFile);
    const exportedFromIndex = indexExports.has(m.name);

    if (CHECK_ONLY) {
      const status = !existsOnDisk ? "FILE MISSING" : "NOT EXPORTED FROM INDEX";
      console.log(`  ${YLW}⚠${RESET}  ${BOLD}${m.name}${RESET}  [${status}]`);
      console.log(`     ${GRY}${m.description}${RESET}`);
    } else {
      // Generate stub file if missing
      if (!existsOnDisk) {
        fs.writeFileSync(targetFile, m.stub, "utf8");
        console.log(`  ${GRN}+${RESET}  ${BOLD}${m.name}${RESET}  → created ${path.relative(ROOT, targetFile)}`);
      } else {
        console.log(`  ${YLW}~${RESET}  ${BOLD}${m.name}${RESET}  → file exists but not exported from index`);
      }

      // Remind about index export
      if (!exportedFromIndex) {
        console.log(`     ${GRY}Add to SDK index: export { ${m.name} } from "./${m.file.replace(".ts", ".js")}";${RESET}`);
      }
    }
  }

  if (CHECK_ONLY) {
    console.log(`\n  ${YLW}${missing.length} Ghost* SDK export(s) missing.${RESET}\n`);
    console.log(`  Run without --check to generate stubs.\n`);
    process.exit(1);
  }

  console.log(`\n  ${GRN}Ghost SDK stubs generated. Wire exports in packages/ghost-sdk/src/index.ts.${RESET}\n`);
  process.exit(0);
}

run();
