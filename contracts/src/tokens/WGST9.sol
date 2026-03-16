// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (tokens/WGST9.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import { GhostBrand } from "../GhostBrand.sol";

/// @title WGST9
/// @notice Wrapped Ghost — canonical ERC-20 wrapper for the native GST gas token.
///         Equivalent in design to battle-tested WETH9, rebranded for GhostChain.
///
///         Wrap:    send native GST → receive WGST (1:1)
///         Unwrap:  call withdraw() → native GST returned (1:1)
///
/// @dev Deployed on each layer:
///      - GhostChain L1 (chain_id 14000101 — canonical)
///      - GhostL2       (chain_id 901       — bridged)
///      - GhostL3       (chain_id 903       — bridged)
///
///      totalSupply() == address(this).balance invariant is preserved at all times.
contract WGST9 is GhostBrand {
    // ──────────────────────────────────── Metadata ─────────────────────────────────────

    string public constant name     = "Wrapped Ghost";
    string public constant symbol   = "WGST";
    uint8  public constant decimals = 18;

    // ──────────────────────────────────── Storage ──────────────────────────────────────

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // ──────────────────────────────────── Events ───────────────────────────────────────

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    // ──────────────────────────────────── Receive ──────────────────────────────────────

    /// @notice Fallback: wrap any native GST sent directly to the contract.
    receive() external payable {
        deposit();
    }

    // ──────────────────────────────────── Core ─────────────────────────────────────────

    /// @notice Wrap native GST into WGST.  msg.value GST → msg.value WGST credited.
    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    /// @notice Unwrap WGST back to native GST.
    /// @param wad Amount of WGST (== GST) to unwrap.
    function withdraw(uint256 wad) public {
        require(balanceOf[msg.sender] >= wad, "WGST: insufficient balance");

        balanceOf[msg.sender] -= wad;

        // unchecked-call lint: capture return and require success.
        (bool ok,) = payable(msg.sender).call{value: wad}("");
        require(ok, "WGST: native transfer failed");

        emit Withdrawal(msg.sender, wad);
        emit Transfer(msg.sender, address(0), wad);
    }

    // ──────────────────────────────── ERC-20 Surface ───────────────────────────────────

    /// @notice Total GST held by this contract — equals total WGST supply.
    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Approve `guy` to spend up to `wad` WGST on behalf of caller.
    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    /// @notice Transfer `wad` WGST from caller to `dst`.
    function transfer(address dst, uint256 wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    /// @notice Transfer `wad` WGST from `src` to `dst`.
    ///         Infinite allowance (type(uint256).max) is never decremented.
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
}
