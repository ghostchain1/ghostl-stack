// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Simple treasury to hold the canonical gas token.
contract Treasury is Governed {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    uint256 internal constant GHOSTCHAIN_CHAIN_ID = 14000101;
    uint256 internal constant GHOSTL2_CHAIN_ID = 901;
    uint256 internal constant GHOSTL3_CHAIN_ID = 903;

    IERC20Balance public immutable native;

    event WithdrawETH(address indexed to, uint256 amount);
    event WithdrawNative(address indexed to, uint256 amount);

    constructor(IERC20Balance _native, address governor_, address timelock_) Governed(governor_, timelock_) {
        _enforceCanonical(address(_native));
        native = _native;
    }

    function _enforceCanonical(address token) internal view {
        if (
            block.chainid == GHOSTCHAIN_CHAIN_ID
                || block.chainid == GHOSTL2_CHAIN_ID
                || block.chainid == GHOSTL3_CHAIN_ID
        ) {
            require(token == CANONICAL_GAS_TOKEN, "non-canonical gas token");
        }
    }

    /// @dev ETH is not a supported gas asset on GhostChain.
    function withdrawETH(address payable to, uint256 amount) external pure {
        to; // silence unused parameter warnings in strict tooling
        amount;
        revert("ETH disabled; use withdrawNative");
    }

    /// #if_succeeds {:msg "only owner withdraw native"} msg.sender == owner;
    /// #if_succeeds {:msg "native balance decreases"} native.balanceOf(address(this)) == old(native.balanceOf(address(this))) - amount;
    function withdrawNative(address to, uint256 amount) external onlyGovernance {
        require(native.transfer(to, amount), "transfer failed");
        emit WithdrawNative(to, amount);
    }

    function gasTokenAddress() external pure returns (address) {
        return CANONICAL_GAS_TOKEN;
    }
}
