/**
 * defi-generator.ts — GRC-20 fungible token generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 GRC-20 token that:
 *   - Inherits from ../ghost/GRC20.sol (GhostChain Contracts v5.6.1)
 *   - Restricts mint to the deployer (onlyOwner)
 *   - Optionally caps total supply
 *   - Optionally adds a pause guard
 */

import {
  GHOST_SPDX_MIT,
  GHOST_PRAGMA,
  ghostContractHeader,
  namedImport,
  natspec,
  solidityFile,
} from "./ast-builder.js";

export interface DefiTokenOptions {
  /** Solidity contract name, e.g. "GhostGovToken" */
  name: string;
  /** Human-readable token name, e.g. "Ghost Governance Token" */
  tokenName: string;
  /** Token symbol, e.g. "GGT" */
  symbol: string;
  /** Token decimals (default 18) */
  decimals?: number;
  /**
   * Maximum total supply in whole tokens (no decimals), e.g. "1000000000".
   * Omit for uncapped supply.
   */
  maxSupply?: string;
  /** Allow owner to mint tokens after deploy (default true) */
  mintable?: boolean;
  /** Allow holders to burn their tokens (default true) */
  burnable?: boolean;
  /** Add a pause guard controlled by the owner (default false) */
  pausable?: boolean;
  /**
   * Relative path from the generated file's directory to `contracts/src/ghost/`.
   * Defaults to "../ghost" (output dir = contracts/src/generated/).
   */
  ghostImportBase?: string;
}

/**
 * Generates a GRC-20 token contract source string.
 *
 * @param opts       Generator options
 * @param outputPath Workspace-relative destination path, used for the header comment.
 *                   E.g. "contracts/src/generated/GhostGovToken.sol"
 */
export function generateDefiToken(
  opts: DefiTokenOptions,
  outputPath: string,
): string {
  const decimals        = opts.decimals   ?? 18;
  const mintable        = opts.mintable   ?? true;
  const burnable        = opts.burnable   ?? true;
  const pausable        = opts.pausable   ?? false;
  const ghostBase       = opts.ghostImportBase ?? "../ghost";
  const maxSupplyUnits  = opts.maxSupply
    ? BigInt(opts.maxSupply) * 10n ** BigInt(decimals)
    : null;

  // ── imports ──
  const imports = [namedImport(["GRC20"], `${ghostBase}/GRC20.sol`)].join("\n");

  // ── contract body sections ────────────────────────────────────────────────
  const stateVars: string[] = [
    `address public owner;`,
  ];

  if (pausable) {
    stateVars.push(`bool    public paused;`);
  }
  if (maxSupplyUnits !== null) {
    stateVars.push(
      `uint256 public constant MAX_SUPPLY = ${maxSupplyUnits.toString()};`,
    );
  }

  const events: string[] = [`event OwnershipTransferred(address indexed from, address indexed to);`];
  if (pausable) {
    events.push(`event Paused(address indexed by);`);
    events.push(`event Unpaused(address indexed by);`);
  }

  const errors: string[] = [
    `error NotOwner();`,
    ...(pausable ? [`error TransferPaused();`] : []),
    ...(maxSupplyUnits !== null ? [`error MaxSupplyExceeded();`] : []),
  ];

  // ── modifiers ──
  const modifiers: string[] = [
    `modifier onlyOwner() {\n        if (msg.sender != owner) revert NotOwner();\n        _;\n    }`,
  ];
  if (pausable) {
    modifiers.push(
      `modifier whenNotPaused() {\n        if (paused) revert TransferPaused();\n        _;\n    }`,
    );
  }

  // ── constructor ──
  const constructorArgs = [
    `string memory _name`,
    `string memory _symbol`,
    `uint256 initialSupply`,
    `address initialOwner`,
  ].join(",\n        ");

  let mintGuard = "";
  if (maxSupplyUnits !== null) {
    mintGuard = `\n        if (totalSupply + initialSupply > MAX_SUPPLY) revert MaxSupplyExceeded();`;
  }
  const ctorBody = `owner = initialOwner;${mintGuard}\n        if (initialSupply > 0) {\n            _mint(initialOwner, initialSupply);\n        }`;

  const constructorBlock = `constructor(\n        ${constructorArgs}\n    ) GRC20(_name, _symbol, ${decimals}) {\n        ${ctorBody}\n    }`;

  // ── functions ──
  const functions: string[] = [];

  // transfer override with pause guard
  if (pausable) {
    functions.push(
      `function transfer(address to, uint256 amount) external override whenNotPaused returns (bool) {\n        _transfer(msg.sender, to, amount);\n        return true;\n    }`,
    );
    functions.push(
      `function transferFrom(address from, address to, uint256 amount) external override whenNotPaused returns (bool) {\n        uint256 allowed = allowance[from][msg.sender];\n        require(allowed >= amount, "GRC20: allowance exceeded");\n        if (allowed != type(uint256).max) {\n            allowance[from][msg.sender] = allowed - amount;\n        }\n        _transfer(from, to, amount);\n        return true;\n    }`,
    );
  }

  // mint (onlyOwner override)
  if (mintable) {
    let mintBody = "";
    if (maxSupplyUnits !== null) {
      mintBody = `if (totalSupply + amount > MAX_SUPPLY) revert MaxSupplyExceeded();\n        _mint(to, amount);`;
    } else {
      mintBody = `_mint(to, amount);`;
    }
    functions.push(
      `/// @notice Mints \`amount\` tokens to \`to\`. Restricted to the owner.\n    function mint(address to, uint256 amount) public override onlyOwner {\n        ${mintBody}\n    }`,
    );
  } else {
    // Sealed mint — override to revert so the public virtual mint cannot be called.
    functions.push(
      `/// @notice Minting is permanently disabled for this token.\n    function mint(address, uint256) public pure override {\n        revert("${opts.name}: minting disabled");\n    }`,
    );
  }

  // burn override
  if (burnable) {
    functions.push(
      `/// @notice Burns \`amount\` tokens from the caller's balance.\n    function burn(uint256 amount) public override {\n        _burn(msg.sender, amount);\n    }`,
    );
    functions.push(
      `/// @notice Burns \`amount\` tokens from \`from\`. Caller must have sufficient allowance.\n    function burnFrom(address from, uint256 amount) public override {\n        uint256 allowed = allowance[from][msg.sender];\n        require(allowed >= amount, "GRC20: burn allowance exceeded");\n        if (allowed != type(uint256).max) {\n            allowance[from][msg.sender] = allowed - amount;\n        }\n        _burn(from, amount);\n    }`,
    );
  }

  // pause / unpause
  if (pausable) {
    functions.push(
      `function pause() external onlyOwner {\n        paused = true;\n        emit Paused(msg.sender);\n    }`,
    );
    functions.push(
      `function unpause() external onlyOwner {\n        paused = false;\n        emit Unpaused(msg.sender);\n    }`,
    );
  }

  // ownership transfer
  functions.push(
    `function transferOwnership(address to) external onlyOwner {\n        require(to != address(0), "${opts.name}: zero address");\n        emit OwnershipTransferred(owner, to);\n        owner = to;\n    }`,
  );

  // ── assemble ──
  const contractBody = [
    `    // ── State ─────────────────────────────────────────────────────────────────\n\n    ${stateVars.join("\n    ")}`,
    `    // ── Events ────────────────────────────────────────────────────────────────\n\n    ${events.join("\n    ")}`,
    errors.length > 0
      ? `    // ── Errors ────────────────────────────────────────────────────────────────\n\n    ${errors.join("\n    ")}`
      : "",
    `    // ── Modifiers ────────────────────────────────────────────────────────────\n\n    ${modifiers.join("\n\n    ")}`,
    `    // ── Constructor ──────────────────────────────────────────────────────────\n\n    ${constructorBlock}`,
    `    // ── External / Public ─────────────────────────────────────────────────────\n\n    ${functions.join("\n\n    ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const doc = natspec({
    title: `${opts.name} — ${opts.tokenName} (GST-${opts.symbol})`,
    notice: `GhostChain GRC-20 token. Symbol: ${opts.symbol}, Decimals: ${decimals}.`,
    dev: [
      "Inherits GRC20 (GhostChain Contracts v5.6.1).",
      mintable ? "Owner-restricted mint." : "Minting permanently disabled.",
      maxSupplyUnits !== null ? `Max supply: ${opts.maxSupply} ${opts.symbol}.` : "",
      pausable ? "Transfers can be paused by owner." : "",
    ]
      .filter(Boolean)
      .join(" "),
  });

  const contractDecl = `${doc}\ncontract ${opts.name} is GRC20 {\n${contractBody}\n}`;

  return solidityFile([
    GHOST_SPDX_MIT,
    GHOST_PRAGMA,
    ghostContractHeader(outputPath),
    imports,
    contractDecl,
  ]);
}
