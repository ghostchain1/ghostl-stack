// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library TreasuryInvariants {
    error NotContract(address candidate);

    function requireContract(address candidate) internal view {
        if (candidate.code.length == 0) {
            revert NotContract(candidate);
        }
    }

    function assertReserveInvariant(uint256 balance, uint256 minReserve) internal pure {
        assert(balance >= minReserve);
    }

    function assertSpendWithinBudget(uint256 spent, uint256 amount, uint256 budget) internal pure {
        assert(spent + amount <= budget);
    }

    function assertMonotonic(uint256 previous, uint256 next) internal pure {
        assert(next >= previous);
    }

    function assertChainMatch(uint256 expected, uint256 actual) internal pure {
        assert(expected == actual);
    }
}
