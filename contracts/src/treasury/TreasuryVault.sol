// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TreasuryInvariants.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Vault that holds protocol assets with immutable controller.
contract TreasuryVault {
    using TreasuryInvariants for uint256;

    address public immutable controller;

    event AssetTransferred(address indexed asset, address indexed to, uint256 amount);
    event AssetCalled(address indexed target, uint256 value, bytes data, bytes result);

    error NotController();

    constructor(address controller_) {
        require(controller_ != address(0), "controller=0");
        TreasuryInvariants.requireContract(controller_);
        controller = controller_;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }

    receive() external payable {}

    function transferERC20(address token, address to, uint256 amount) external onlyController {
        require(token != address(0), "token=0");
        require(to != address(0), "to=0");
        require(IERC20Minimal(token).transfer(to, amount), "transfer failed");
        emit AssetTransferred(token, to, amount);
    }

    function transferETH(address payable to, uint256 amount) external onlyController {
        require(to != address(0), "to=0");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "eth transfer failed");
        emit AssetTransferred(address(0), to, amount);
    }

    function call(address target, uint256 value, bytes calldata data) external onlyController returns (bytes memory) {
        require(target != address(0), "target=0");
        (bool ok, bytes memory result) = target.call{value: value}(data);
        require(ok, "call failed");
        emit AssetCalled(target, value, data, result);
        return result;
    }

    function balanceOf(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20Minimal(token).balanceOf(address(this));
    }
}
