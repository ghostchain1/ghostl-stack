/**
 * treasury-buyback-generator.ts — Automated protocol treasury buyback contract generator.
 *
 * Produces a Forge-lint-compliant Solidity 0.8.24 treasury buyback contract with:
 *   - `receiveRevenue(uint256 amount)` — pulls GRC-20 revenue tokens from caller
 *   - `triggerBuyback(uint256 amount)` — guardian/owner: swap revenue → target via GhostXRouter
 *   - `triggerBuybackMax()` — swap entire revenue balance
 *   - `setRouter(address)` — owner: set GhostXRouter address
 *   - `setTargetToken(address)` — owner: set token to buy back
 *   - `setRevenueToken(address)` — owner: set token received as revenue
 *   - `setBuybackThreshold(uint256)` — owner: minimum balance before auto-trigger
 *   - `setGuardian(address)` — owner: allow a trusted EOA/contract to trigger buybacks
 *   - `withdraw(address to, uint256 amount)` — owner: emergency withdrawal of revenue tokens
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

export interface TreasuryBuybackOptions {
  /** Solidity contract name, e.g. "GhostTreasuryBuyback" */
  name: string;
  /** Human-readable label for error messages */
  label?: string;
  /**
   * Default buyback threshold (in revenue token units).
   * When `receiveRevenue` is called and balance exceeds this, a buyback is emitted as an event.
   * Default "1000000000000000000000" (1000 tokens × 1e18)
   */
  defaultThreshold?: string;
}

/**
 * Generates a treasury buyback contract source string.
 */
export function generateTreasuryBuyback(
  opts: TreasuryBuybackOptions,
  outputPath: string,
): string {
  const label     = opts.label ?? opts.name;
  const threshold = opts.defaultThreshold ?? "1000000000000000000000";

  const statVars = `
    // ── GRC-20 interface ────────────────────────────────────────────────────
${inlineGRC20Interface()}

    // ── Minimal GhostXRouter interface ───────────────────────────────────────
    interface IGhostXRouter {
        function swapExactTokensForTokens(
            uint256 amountIn,
            uint256 amountOutMin,
            address[] calldata path,
            address to,
            uint256 deadline
        ) external returns (uint256[] memory amounts);
    }

    // ── State ────────────────────────────────────────────────────────────────
    address public owner;
    address public guardian;

    IGRC20        public revenueToken;   // incoming protocol fees
    IGRC20        public targetToken;    // token to buy back & burn/hold
    IGhostXRouter public router;         // GhostXRouter

    uint256 public buybackThreshold = ${threshold};
    uint256 public revenueBalance;       // tracked balance (without taxing msg.value)
    uint256 public totalBoughtBack;      // cumulative stat

    // ── Events ───────────────────────────────────────────────────────────────
    event RevenueReceived(address indexed from, uint256 amount);
    event BuybackExecuted(uint256 revenueSpent, uint256 targetReceived);
    event ThresholdReached(uint256 balance, uint256 threshold);
    event RouterSet(address indexed router);
    event TargetTokenSet(address indexed token);
    event RevenueTokenSet(address indexed token);
    event ThresholdSet(uint256 threshold);
    event GuardianSet(address indexed guardian);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed prev, address indexed next);

    // ── Custom errors ─────────────────────────────────────────────────────────
    error NotOwnerOrGuardian();
    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error BelowThreshold(uint256 balance, uint256 threshold);
    error RouterNotSet();
    error TargetNotSet();
    error RevenueNotSet();
    error TransferFailed();
    error InsufficientBalance();
`;

  const constructor = `
    constructor(
        address revenueToken_,
        address targetToken_,
        address router_
    ) {
        owner        = msg.sender;
        guardian     = msg.sender;
        if (revenueToken_ != address(0)) revenueToken = IGRC20(revenueToken_);
        if (targetToken_  != address(0)) targetToken  = IGRC20(targetToken_);
        if (router_       != address(0)) router       = IGhostXRouter(router_);
    }
`;

  const modifiers = `
    // ── Access modifiers ──────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert NotOwnerOrGuardian();
        _;
    }
`;

  const revenueFn = `
    // ── Revenue intake ────────────────────────────────────────────────────────

    ${natspec({ title: "Pull `amount` revenue tokens from caller and record them." })}
    function receiveRevenue(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (address(revenueToken) == address(0)) revert RevenueNotSet();

        (bool ok,) = address(revenueToken).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender, address(this), amount
            )
        );
        require(ok, "${label}: receiveRevenue transferFrom failed");

        revenueBalance += amount;
        emit RevenueReceived(msg.sender, amount);

        if (revenueBalance >= buybackThreshold) {
            emit ThresholdReached(revenueBalance, buybackThreshold);
        }
    }
`;

  const buybackFn = `
    // ── Buyback ───────────────────────────────────────────────────────────────

    ${natspec({ title: "Swap `amount` revenue tokens for target tokens via GhostXRouter." })}
    function triggerBuyback(uint256 amount, uint256 amountOutMin) external onlyOwnerOrGuardian {
        _executeBuyback(amount, amountOutMin);
    }

    ${natspec({ title: "Swap the entire revenue balance for target tokens." })}
    function triggerBuybackMax(uint256 amountOutMin) external onlyOwnerOrGuardian {
        _executeBuyback(revenueBalance, amountOutMin);
    }

    function _executeBuyback(uint256 amount, uint256 amountOutMin) internal {
        if (amount == 0) revert ZeroAmount();
        if (revenueBalance < amount) revert InsufficientBalance();
        if (address(router) == address(0)) revert RouterNotSet();
        if (address(targetToken) == address(0)) revert TargetNotSet();
        if (address(revenueToken) == address(0)) revert RevenueNotSet();

        revenueBalance -= amount;

        // Approve router to spend revenue tokens
        (bool approveOk,) = address(revenueToken).call(
            abi.encodeWithSignature("approve(address,uint256)", address(router), amount)
        );
        require(approveOk, "${label}: approve failed");

        // Build swap path: revenue → target
        address[] memory path = new address[](2);
        path[0] = address(revenueToken);
        path[1] = address(targetToken);

        uint256[] memory amounts = router.swapExactTokensForTokens(
            amount,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 300
        );

        uint256 received = amounts[amounts.length - 1];
        totalBoughtBack += received;

        emit BuybackExecuted(amount, received);
    }
`;

  const adminFns = `
    // ── Admin ─────────────────────────────────────────────────────────────────

    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert ZeroAddress();
        router = IGhostXRouter(router_);
        emit RouterSet(router_);
    }

    function setTargetToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        targetToken = IGRC20(token);
        emit TargetTokenSet(token);
    }

    function setRevenueToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        revenueToken = IGRC20(token);
        emit RevenueTokenSet(token);
    }

    function setBuybackThreshold(uint256 threshold) external onlyOwner {
        buybackThreshold = threshold;
        emit ThresholdSet(threshold);
    }

    function setGuardian(address guardian_) external onlyOwner {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (revenueBalance < amount) revert InsufficientBalance();

        revenueBalance -= amount;

        (bool ok,) = address(revenueToken).call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok, "${label}: withdraw transfer failed");

        emit EmergencyWithdraw(to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
`;

  const body = [
    statVars,
    constructor,
    modifiers,
    revenueFn,
    buybackFn,
    adminFns,
  ];

  return solidityFile([
    GHOST_SPDX_MIT,
    ghostContractHeader(outputPath),
    GHOST_PRAGMA,
    `\ncontract ${opts.name} {\n${body.join("")}}`,
  ]);
}
