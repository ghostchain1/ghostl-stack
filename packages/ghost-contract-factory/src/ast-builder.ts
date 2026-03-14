/**
 * ast-builder.ts — GhostChain Contracts source-string primitives.
 *
 * Low-level string helpers used by all contract generators.
 * Every generator composes these to produce Forge-lint-compliant Solidity 0.8.24.
 */

// ── File header constants ─────────────────────────────────────────────────────

export const GHOST_SPDX_MIT        = "// SPDX-License-Identifier: MIT";
export const GHOST_SPDX_UNLICENSED = "// SPDX-License-Identifier: UNLICENSED";
export const GHOST_PRAGMA          = "pragma solidity 0.8.24;";

/**
 * Returns the mandatory GhostChain Contracts header comment.
 * @param relativePath  Workspace-relative path to the generated file,
 *                      e.g. "contracts/src/generated/MyToken.sol"
 */
export function ghostContractHeader(relativePath: string): string {
  return `// GhostChain Contracts v5.6.1 (${relativePath})`;
}

// ── Import helpers ────────────────────────────────────────────────────────────

/** Named import: `import { Foo, Bar } from "path";` */
export function namedImport(symbols: string[], path: string): string {
  return `import { ${symbols.join(", ")} } from "${path}";`;
}

/** Plain import: `import "path";` */
export function plainImport(path: string): string {
  return `import "${path}";`;
}

// ── NatSpec helpers ───────────────────────────────────────────────────────────

export interface NatSpecOpts {
  title?: string;
  notice?: string;
  dev?: string;
  params?: Array<{ name: string; desc: string }>;
  returns?: string;
}

/** Builds a NatSpec block comment. */
export function natspec(opts: NatSpecOpts): string {
  const lines: string[] = ["/**"];
  if (opts.title)  lines.push(` * @title ${opts.title}`);
  if (opts.notice) lines.push(` * @notice ${opts.notice}`);
  if (opts.dev)    lines.push(` * @dev ${opts.dev}`);
  for (const p of opts.params ?? []) {
    lines.push(` * @param ${p.name} ${p.desc}`);
  }
  if (opts.returns) lines.push(` * @return ${opts.returns}`);
  lines.push(" */");
  return lines.join("\n");
}

// ── Inline interface helpers ──────────────────────────────────────────────────

/**
 * Generates a minimal GRC-20 interface for contracts that need to call
 * external token methods without importing the full base.
 */
export function inlineGRC20Interface(): string {
  return `\
interface IGRC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}`;
}

// ── Solidity file assembler ───────────────────────────────────────────────────

/**
 * Joins non-empty sections with a blank line separator and appends a
 * trailing newline — the canonical Forge-formatted file ending.
 */
export function solidityFile(sections: string[]): string {
  return sections.filter(Boolean).join("\n\n") + "\n";
}

// ── Code-gen utilities ────────────────────────────────────────────────────────

/** Indents every line of `block` by `spaces` spaces. */
export function indent(block: string, spaces = 4): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((l) => (l.trim() === "" ? "" : pad + l))
    .join("\n");
}

/** Wraps a body in a `modifier` definition. */
export function modifier(name: string, params: string, body: string): string {
  return `modifier ${name}(${params}) {\n${indent(body)}\n    _;\n}`;
}

/**
 * Produces a `require`-wrapped safe transfer call.
 * Forge lint: `erc20-unchecked-transfer` — all transfer calls must be require-checked.
 */
export function safeTransferCall(
  tokenVar: string,
  to: string,
  amount: string,
  errMsg: string,
): string {
  return [
    `bool _ok = IGRC20(${tokenVar}).transfer(${to}, ${amount});`,
    `require(_ok, "${errMsg}");`,
  ].join("\n");
}

export function safeTransferFromCall(
  tokenVar: string,
  from: string,
  to: string,
  amount: string,
  errMsg: string,
): string {
  return [
    `bool _ok = IGRC20(${tokenVar}).transferFrom(${from}, ${to}, ${amount});`,
    `require(_ok, "${errMsg}");`,
  ].join("\n");
}
