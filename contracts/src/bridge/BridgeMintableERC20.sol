// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibErrors} from "../common/LibErrors.sol";

/// @notice GRC-20/GST20 token that can ONLY be minted/burned by a bridge.
/// Use this for the "representation" token on the child chain.
contract BridgeMintableGST20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;

    address public bridge;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed a, address indexed spender, uint256 amount);

    modifier onlyBridge() {
        if (msg.sender != bridge) revert LibErrors.NotAuthorized();
        _;
    }

    constructor(string memory n, string memory s, uint8 d, address _bridge) {
        if (_bridge == address(0)) revert LibErrors.ZeroAddress();
        name = n;
        symbol = s;
        decimals = d;
        bridge = _bridge;
    }

    function mint(address to, uint256 amount) external onlyBridge {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyBridge {
        uint256 b = balanceOf[from];
        require(b >= amount, "balance");
        unchecked {
            balanceOf[from] = b - amount;
        }
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        unchecked {
            allowance[from][msg.sender] = a - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to=0");
        uint256 b = balanceOf[from];
        require(b >= amount, "balance");
        unchecked {
            balanceOf[from] = b - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
