/**
 * vesting-generator.ts — Linear token vesting contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 vesting contract with:
 *   - `release()` — releases all currently vested tokens to the beneficiary
 *   - `vestedAmount()` — view: tokens vested so far (includes already released)
 *   - `releasable()` — view: tokens available to release right now
 *   - `revoke()` — owner only, revocable vests: sends unvested tokens back to owner
 *
 * Vesting model: cliff → then linear release over duration.
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

export interface VestingOptions {
  /** Solidity contract name, e.g. "GhostTeamVesting" */
  name: string;
  /** Human-readable label used in error messages */
  label?: string;
  /**
   * Default cliff in seconds. Encoded as a constant in the contract.
   * Deployer overrides via constructor arg.
   * Default: 0 (no cliff comment reminder)
   */
  defaultCliffSeconds?: number;
  /**
   * Default vesting duration in seconds.
   * Default: 31536000 (1 year)
   */
  defaultDurationSeconds?: number;
  /** Whether to include revoke() — revocable vesting. Default true. */
  revocable?: boolean;
  /** Relative path from the generated file to contracts/src/ghost/ */
  ghostImportBase?: string;
}

/**
 * Generates a linear token vesting contract source string.
 */
export function generateVesting(
  opts: VestingOptions,
  outputPath: string,
): string {
  const label       = opts.label ?? opts.name;
  const revocable   = opts.revocable !== false;
  const defaultDur  = opts.defaultDurationSeconds ?? 31_536_000;
  const defaultCliff = opts.defaultCliffSeconds ?? 0;

  const statVars = `
    // ── GRC-20 interface ────────────────────────────────────────────────────
${inlineGRC20Interface()}

    // ── Immutable configuration ──────────────────────────────────────────────
    IGRC20  public immutable TOKEN;
    address public immutable BENEFICIARY;
    uint256 public immutable START;
    uint256 public immutable CLIFF;
    uint256 public immutable DURATION;
    bool    public immutable REVOCABLE;

    // ── Mutable state ────────────────────────────────────────────────────────
    address public owner;
    uint256 public released;
    bool    public revoked;

    // ── Events ───────────────────────────────────────────────────────────────
    event Released(address indexed beneficiary, uint256 amount);
    event Revoked(address indexed owner, uint256 unvested);
    event OwnershipTransferred(address indexed prev, address indexed next);

    // ── Custom errors ────────────────────────────────────────────────────────
    error NotOwner();
    error NotBeneficiary();
    error CliffNotReached();
    error NothingToRelease();
    error VestingRevoked();
    error NotRevocable();
    error ZeroAddress();
`;

  const constructor = `
    constructor(
        address token_,
        address beneficiary_,
        uint256 cliffSeconds_,
        uint256 durationSeconds_,
        bool    revocable_
    ) {
        if (token_ == address(0))       revert ZeroAddress();
        if (beneficiary_ == address(0)) revert ZeroAddress();
        require(durationSeconds_ > 0, "${label}: zero duration");

        TOKEN       = IGRC20(token_);
        BENEFICIARY = beneficiary_;
        START       = block.timestamp;
        CLIFF       = block.timestamp + cliffSeconds_;
        DURATION    = durationSeconds_;
        REVOCABLE   = revocable_;
        owner       = msg.sender;
    }
`;

  const viewFns = `
    // ── View functions ───────────────────────────────────────────────────────

    ${natspec({ title: "Total tokens vested as of now (includes already-released tokens)." })}
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < CLIFF) return 0;
        uint256 balance = TOKEN.balanceOf(address(this)) + released;
        uint256 elapsed = block.timestamp - START;
        if (elapsed >= DURATION) return balance;
        return balance * elapsed / DURATION;
    }

    ${natspec({ title: "Tokens available to release right now." })}
    function releasable() public view returns (uint256) {
        return vestedAmount() - released;
    }
`;

  const releaseFn = `
    // ── Release ──────────────────────────────────────────────────────────────

    ${natspec({ title: "Release all currently vested tokens to the beneficiary." })}
    function release() external {
        if (revoked) revert VestingRevoked();
        if (block.timestamp < CLIFF) revert CliffNotReached();

        uint256 amount = releasable();
        if (amount == 0) revert NothingToRelease();

        released += amount;

        (bool ok,) = address(TOKEN).call(
            abi.encodeWithSignature("transfer(address,uint256)", BENEFICIARY, amount)
        );
        require(ok, "${label}: release transfer failed");

        emit Released(BENEFICIARY, amount);
    }
`;

  const revokeFn = revocable ? `
    // ── Revoke ───────────────────────────────────────────────────────────────

    ${natspec({ title: "Owner revokes vesting. Unvested tokens return to owner." })}
    function revoke() external {
        if (msg.sender != owner) revert NotOwner();
        if (!REVOCABLE) revert NotRevocable();
        if (revoked) revert VestingRevoked();

        uint256 vested   = vestedAmount();
        uint256 unvested = TOKEN.balanceOf(address(this)) - (vested - released);

        revoked = true;

        if (unvested > 0) {
            (bool ok,) = address(TOKEN).call(
                abi.encodeWithSignature("transfer(address,uint256)", owner, unvested)
            );
            require(ok, "${label}: revoke transfer failed");
        }

        emit Revoked(owner, unvested);
    }
` : "";

  const adminFn = `
    // ── Admin ────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
`;

  const body = [
    statVars,
    constructor,
    viewFns,
    releaseFn,
    revokeFn,
    adminFn,
  ];

  return solidityFile([
    GHOST_SPDX_MIT,
    ghostContractHeader(outputPath),
    GHOST_PRAGMA,
    `\ncontract ${opts.name} {\n${body.join("")}}`,
  ]);
}
