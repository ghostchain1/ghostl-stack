/**
 * SDK Wrapper Generator
 *
 * Generates TypeScript method stubs compatible with the ghost-sdk-core
 * pattern: each method is an async function that calls through to the
 * underlying contract binding.
 *
 * Output is returned as a string — the caller decides where to write it.
 * The engine controller (index.ts) appends generated methods to the
 * appropriate SDK file only if the method is not already present.
 */

/** A minimal description of a contract function for code generation. */
export interface FunctionSpec {
  name: string;
  /** Solidity parameter types (for documentation only). */
  params?: string[];
  /** Indicates a read-only call vs a state-changing transaction. */
  readonly?: boolean;
}

/**
 * Generate a single TypeScript SDK wrapper method for `spec`.
 *
 * The generated code follows the ghost-sdk-core convention:
 *   - `call()` for read-only functions
 *   - `send()` for state-changing transactions
 */
export function generateSDKWrapper(spec: FunctionSpec | string): string {
  const fn: FunctionSpec =
    typeof spec === "string" ? { name: spec } : spec;

  const { name, params = [], readonly: isReadonly = false } = fn;
  const spreadParams = params.length > 0 ? "...args: unknown[]" : "";
  const callSite = params.length > 0 ? "...args" : "";

  if (isReadonly) {
    return `
  /** Auto-generated read wrapper: ${name}. */
  async ${name}(${spreadParams}): Promise<unknown> {
    return this.contract.call("${name}"${callSite ? `, ${callSite}` : ""});
  }`;
  }

  return `
  /** Auto-generated send wrapper: ${name}. */
  async ${name}(${spreadParams}): Promise<unknown> {
    return this.contract.send("${name}"${callSite ? `, ${callSite}` : ""});
  }`;
}

/**
 * Generate a complete class declaration containing SDK wrappers for each
 * function in `specs`.  Used when creating a brand-new SDK file.
 */
export function generateSDKClass(contractName: string, specs: FunctionSpec[]): string {
  const methods = specs.map((s) => generateSDKWrapper(s)).join("\n");
  return `// GhostChain Autonomous Contract Engine — auto-generated SDK wrapper
// Contract: ${contractName}
// @ghost-engine-generated

import type { GhostContract } from "@ghostchain/ghost-sdk-core";

export class ${contractName}SDK {
  constructor(private readonly contract: GhostContract) {}
${methods}
}
`;
}
