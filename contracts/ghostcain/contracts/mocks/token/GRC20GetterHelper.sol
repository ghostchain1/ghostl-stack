// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IGRC20} from "../../token/GRC20/IGRC20.sol";
import {IGRC20Metadata} from "../../token/GRC20/extensions/IGRC20Metadata.sol";

contract GRC20GetterHelper {
    event GRC20TotalSupply(IGRC20 token, uint256 totalSupply);
    event GRC20BalanceOf(IGRC20 token, address account, uint256 balanceOf);
    event GRC20Allowance(IGRC20 token, address owner, address spender, uint256 allowance);
    event GRC20Name(IGRC20Metadata token, string name);
    event GRC20Symbol(IGRC20Metadata token, string symbol);
    event GRC20Decimals(IGRC20Metadata token, uint8 decimals);

    function totalSupply(IGRC20 token) external {
        emit GRC20TotalSupply(token, token.totalSupply());
    }

    function balanceOf(IGRC20 token, address account) external {
        emit GRC20BalanceOf(token, account, token.balanceOf(account));
    }

    function allowance(IGRC20 token, address owner, address spender) external {
        emit GRC20Allowance(token, owner, spender, token.allowance(owner, spender));
    }

    function name(IGRC20Metadata token) external {
        emit GRC20Name(token, token.name());
    }

    function symbol(IGRC20Metadata token) external {
        emit GRC20Symbol(token, token.symbol());
    }

    function decimals(IGRC20Metadata token) external {
        emit GRC20Decimals(token, token.decimals());
    }
}
