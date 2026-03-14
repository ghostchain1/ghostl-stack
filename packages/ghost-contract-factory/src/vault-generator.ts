/**
 * vault-generator.ts — ERC-4626-style yield vault contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 vault contract with:
 *   - `deposit(uint256 assets, address receiver)` — deposit + mint shares
 *   - `withdraw(uint256 assets, address receiver)` — burn shares + withdraw assets
 *   - `redeem(uint256 shares, address receiver)` — alias for withdraw by shares
 *   - `totalAssets()` — total managed assets (principal + accrued yield)
 *   - `convertToShares(uint256 assets)` → shares
 *   - `convertToAssets(uint256 shares)` → assets
 *   - `fundYield(uint256 amount)` — anyone deposits yield tokens; inflates share price
 *   - `setYieldOracle(address)` — owner can point to an external yield oracle
 *
 * All transfer calls are require-wrapped (Forge lint: erc20-unchecked-transfer).
 */

import {
  GHOST_SPDX_MIT,
  GHOST_PRAGMA,
  ghostContractHeader,
  inlineGRC20Interface,
  natspec,
  solidityFile,
} from "./ast-builder.js";

export interface VaultOptions {
  /** Solidity contract name, e.g. "GhostYieldVault" */
  name: string;
  /** Human-readable label, e.g. "GhostYieldVault" */
  label?: string;
  /** LP share token name, default "${name} Shares" */
  shareName?: string;
  /** LP share token symbol, default "g${SYMBOL}" */
  shareSymbol?: string;
  /** Relative path from the generated file to contracts/src/ghost/ (default "../ghost") */
  ghostImportBase?: string;
}

/**
 * Generates a yield vault contract source string.
 */
export function generateVault(
  opts: VaultOptions,
  outputPath: string,
): string {
  const label       = opts.label ?? opts.name;
  const shareName   = opts.shareName   ?? `${label} Shares`;
  const shareSymbol = opts.shareSymbol ?? `g${label.toUpperCase().slice(0, 4)}`;

  const statVars = `
    // ── GRC-20 interface ────────────────────────────────────────────────────
${inlineGRC20Interface()}

    // ── Share token metadata ────────────────────────────────────────────────
    string public constant name   = "${shareName}";
    string public constant symbol = "${shareSymbol}";
    uint8  public constant decimals = 18;

    // ── Core storage ────────────────────────────────────────────────────────
    IGRC20  public immutable ASSET;
    address public           owner;
    address public           yieldOracle;

    uint256 public totalShares;
    uint256 public totalAssets;

    mapping(address => uint256) public sharesOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ── Events ───────────────────────────────────────────────────────────────
    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event YieldFunded(address indexed funder, uint256 amount);
    event YieldOracleSet(address indexed oracle);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner_, address indexed spender, uint256 amount);
    event OwnershipTransferred(address indexed prev, address indexed next);

    // ── Custom errors ────────────────────────────────────────────────────────
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientShares();
    error InsufficientAllowance();
    error TransferFailed();
    error NotOwner();
`;

  const constructor = `
    constructor(address asset_) {
        if (asset_ == address(0)) revert ZeroAddress();
        ASSET = IGRC20(asset_);
        owner = msg.sender;
    }
`;

  const viewFns = `
    // ── View functions ───────────────────────────────────────────────────────

    ${natspec({ title: "Convert assets to vault shares (rounds down)." })}
    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalShares;
        if (supply == 0) return assets;
        return assets * supply / totalAssets;
    }

    ${natspec({ title: "Convert vault shares to underlying assets (rounds down)." })}
    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalShares;
        if (supply == 0) return shares;
        return shares * totalAssets / supply;
    }
`;

  const depositFn = `
    // ── Deposit ──────────────────────────────────────────────────────────────

    ${natspec({ title: "Deposit `assets` GRC-20 tokens and mint shares to `receiver`." })}
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        shares = convertToShares(assets);
        if (shares == 0) shares = assets; // first depositor 1:1

        totalAssets += assets;
        totalShares += shares;
        sharesOf[receiver] += shares;

        (bool ok,) = address(ASSET).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), assets
            )
        );
        require(ok, "${label}: deposit transferFrom failed");

        emit Deposit(msg.sender, receiver, assets, shares);
        emit Transfer(address(0), receiver, shares);
    }
`;

  const withdrawFn = `
    // ── Withdraw ─────────────────────────────────────────────────────────────

    ${natspec({ title: "Withdraw `assets` underlying tokens by burning shares from `msg.sender`." })}
    function withdraw(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        shares = convertToShares(assets);
        if (sharesOf[msg.sender] < shares) revert InsufficientShares();

        sharesOf[msg.sender] -= shares;
        totalShares          -= shares;
        totalAssets          -= assets;

        (bool ok,) = address(ASSET).call(
            abi.encodeWithSignature("transfer(address,uint256)", receiver, assets)
        );
        require(ok, "${label}: withdraw transfer failed");

        emit Withdraw(msg.sender, receiver, assets, shares);
        emit Transfer(msg.sender, address(0), shares);
    }

    ${natspec({ title: "Redeem `shares` for underlying assets." })}
    function redeem(uint256 shares, address receiver) external returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (sharesOf[msg.sender] < shares) revert InsufficientShares();

        assets = convertToAssets(shares);

        sharesOf[msg.sender] -= shares;
        totalShares          -= shares;
        totalAssets          -= assets;

        (bool ok,) = address(ASSET).call(
            abi.encodeWithSignature("transfer(address,uint256)", receiver, assets)
        );
        require(ok, "${label}: redeem transfer failed");

        emit Withdraw(msg.sender, receiver, assets, shares);
        emit Transfer(msg.sender, address(0), shares);
    }
`;

  const yieldFn = `
    // ── Yield ────────────────────────────────────────────────────────────────

    ${natspec({ title: "Fund the vault with additional yield tokens. Inflates share price for all holders." })}
    function fundYield(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        totalAssets += amount;

        (bool ok,) = address(ASSET).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), amount
            )
        );
        require(ok, "${label}: fundYield transferFrom failed");

        emit YieldFunded(msg.sender, amount);
    }
`;

  const adminFns = `
    // ── Admin ────────────────────────────────────────────────────────────────

    function setYieldOracle(address oracle) external {
        if (msg.sender != owner) revert NotOwner();
        yieldOracle = oracle;
        emit YieldOracleSet(oracle);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
`;

  const grc20ShareFns = `
    // ── GRC-20 share token interface ─────────────────────────────────────────

    function balanceOf(address account) external view returns (uint256) {
        return sharesOf[account];
    }

    function totalSupply() external view returns (uint256) {
        return totalShares;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (sharesOf[msg.sender] < amount) revert InsufficientShares();
        sharesOf[msg.sender] -= amount;
        sharesOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] -= amount;
        sharesOf[from]              -= amount;
        sharesOf[to]                += amount;
        emit Transfer(from, to, amount);
        return true;
    }
`;

  const body = [
    statVars,
    constructor,
    viewFns,
    depositFn,
    withdrawFn,
    yieldFn,
    adminFns,
    grc20ShareFns,
  ];

  return solidityFile([
    GHOST_SPDX_MIT,
    ghostContractHeader(outputPath),
    GHOST_PRAGMA,
    `\ncontract ${opts.name} {\n${body.join("")}}`,
  ]);
}
