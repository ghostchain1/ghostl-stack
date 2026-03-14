// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (tokens/WGST10.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";
import { ReentrancyGuard } from "../common/ReentrancyGuard.sol";

/// @title IWGST10FlashBorrower
/// @notice Interface that flash-mint receivers must implement (ERC-3156 style).
interface IWGST10FlashBorrower {
    /// @param initiator  The address that initiated the flash mint.
    /// @param token      Always == address(WGST10).
    /// @param amount     GST amount borrowed.
    /// @param fee        Fee charged (currently 0 for GhostChain).
    /// @param data       Arbitrary calldata forwarded from the flash-mint caller.
    /// @return keccak256("GhostFlashBorrower.onFlashLoan") — acts as ack.
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32);
}

/// @title WGST10
/// @notice Wrapped Ghost v2 — ERC-20 wrapper for native GST with:
///         • EIP-2612 permit   — gasless off-chain approvals
///         • ERC-3156 flash mint — mint unbacked WGST for a single tx (fee = 0)
///
///         Upgraded from WGST9; fully backward-compatible ERC-20 surface.
///
/// @dev EIP-712 domain: "WGST10", version "1".
///      Flash mint cap: MAX_FLASH_AMOUNT (safety rail).
contract WGST10 is GhostBrand, ReentrancyGuard {
    // ──────────────────────────────────── Metadata ─────────────────────────────────────

    string public constant name     = "Wrapped Ghost";
    string public constant symbol   = "WGST";
    uint8  public constant decimals = 18;

    // ──────────────────────────────────── EIP-712 ──────────────────────────────────────

    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
    bytes32 public constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(address => uint256) public nonces;

    // ────────────────────────────────── Flash mint ─────────────────────────────────────

    /// @notice Ack returned by compliant flash borrowers.
    bytes32 public constant FLASH_CALLBACK_SUCCESS =
        keccak256("GhostFlashBorrower.onFlashLoan");

    /// @notice Maximum single flash-mint (1 billion WGST).  Safety cap.
    uint256 public constant MAX_FLASH_AMOUNT = 1_000_000_000 * GST_UNIT;

    // ──────────────────────────────────── Storage ──────────────────────────────────────

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ──────────────────────────────────── Events ───────────────────────────────────────

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);
    event FlashMint(address indexed receiver, uint256 amount);

    // ──────────────────────────────────── Init ─────────────────────────────────────────

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ──────────────────────────────────── Receive ──────────────────────────────────────

    /// @notice Wrap any native GST sent directly to the contract.
    receive() external payable {
        deposit();
    }

    // ──────────────────────────────────── Core ─────────────────────────────────────────

    /// @notice Wrap native GST into WGST.
    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    /// @notice Unwrap WGST back to native GST.
    function withdraw(uint256 wad) public nonReentrant {
        require(balanceOf[msg.sender] >= wad, "WGST: insufficient balance");

        balanceOf[msg.sender] -= wad;

        // unchecked-call lint: capture return and require success.
        (bool ok,) = payable(msg.sender).call{value: wad}("");
        require(ok, "WGST: native transfer failed");

        emit Withdrawal(msg.sender, wad);
        emit Transfer(msg.sender, address(0), wad);
    }

    // ──────────────────────────────── ERC-20 Surface ───────────────────────────────────

    /// @notice Total GST held by this contract  (== real circulating WGST supply).
    ///         Note: during a flash mint the invariant temporarily breaks — balance
    ///         is restored before the tx ends.
    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) public returns (bool) {
        return transferFrom(msg.sender, to, value);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, "WGST: insufficient balance");

        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "WGST: allowance exceeded");
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        balanceOf[dst] += wad;

        emit Transfer(src, dst, wad);
        return true;
    }

    // ──────────────────────────────── EIP-2612 Permit ──────────────────────────────────

    /// @notice Approve by signature — gasless allowance.
    /// @param owner    Token owner granting the allowance.
    /// @param spender  Address allowed to spend.
    /// @param value    Allowance amount.
    /// @param deadline Unix timestamp after which the permit is invalid.
    /// @param v,r,s    EIP-712 signature components.
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "WGST: permit expired");

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline)
                )
            )
        );

        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == owner, "WGST: invalid signature");

        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    // ──────────────────────────────── ERC-3156 Flash Mint ──────────────────────────────

    /// @notice Maximum flash-mintable amount for `token` (only WGST10 itself supported).
    function maxFlashLoan(address token) external view returns (uint256) {
        return token == address(this) ? MAX_FLASH_AMOUNT : 0;
    }

    /// @notice Flash fee — always 0 for GhostChain (fee-less flash).
    function flashFee(address token, uint256 /*amount*/) external view returns (uint256) {
        require(token == address(this), "WGST: unsupported token");
        return 0;
    }

    /// @notice Flash mint `amount` WGST to `receiver`.
    ///         The receiver must repay `amount` WGST before the call returns,
    ///         and must return FLASH_CALLBACK_SUCCESS.
    /// @param receiver  Contract implementing IWGST10FlashBorrower.
    /// @param token     Must equal address(this).
    /// @param amount    WGST to mint (not backed by GST — temporary).
    /// @param data      Forwarded to receiver.onFlashLoan.
    function flashLoan(
        IWGST10FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant returns (bool) {
        require(token == address(this), "WGST: unsupported token");
        require(amount <= MAX_FLASH_AMOUNT, "WGST: exceeds flash cap");

        // Mint unbacked WGST to receiver.
        balanceOf[address(receiver)] += amount;
        emit Transfer(address(0), address(receiver), amount);
        emit FlashMint(address(receiver), amount);

        // Callback — receiver must use and repay within this call.
        bytes32 ack = receiver.onFlashLoan(msg.sender, token, amount, 0, data);
        require(ack == FLASH_CALLBACK_SUCCESS, "WGST: flash callback failed");

        // Pull repayment back.
        uint256 repayAllowance = allowance[address(receiver)][address(this)];
        require(repayAllowance >= amount, "WGST: flash repay allowance");
        allowance[address(receiver)][address(this)] = repayAllowance - amount;

        require(balanceOf[address(receiver)] >= amount, "WGST: flash repay balance");
        balanceOf[address(receiver)] -= amount;
        emit Transfer(address(receiver), address(0), amount);

        return true;
    }
}
