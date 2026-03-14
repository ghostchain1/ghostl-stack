// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (token/GRC6909/extensions/GRC6909TokenSupply.sol)

pragma solidity ^0.8.20;

import {GRC6909} from "../GRC6909.sol";
import {IGRC6909TokenSupply} from "../../../interfaces/IGRC6909.sol";
import {IGST165} from "../../../utils/introspection/IGST165.sol";

/**
 * @dev Implementation of the Token Supply extension defined in GRC6909.
 * Tracks the total supply of each token id individually.
 */
contract GRC6909TokenSupply is GRC6909, IGRC6909TokenSupply {
    mapping(uint256 id => uint256) private _totalSupplies;

    /// @inheritdoc IGRC6909TokenSupply
    function totalSupply(uint256 id) public view virtual override returns (uint256) {
        return _totalSupplies[id];
    }

    /// @inheritdoc IGST165
    function supportsInterface(bytes4 interfaceId) public view virtual override(GRC6909, IGST165) returns (bool) {
        return interfaceId == type(IGRC6909TokenSupply).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @dev Override the `_update` function to update the total supply of each token id as necessary.
    function _update(address from, address to, uint256 id, uint256 amount) internal virtual override {
        super._update(from, to, id, amount);

        if (from == address(0)) {
            _totalSupplies[id] += amount;
        }
        if (to == address(0)) {
            unchecked {
                // amount <= _balances[from][id] <= _totalSupplies[id]
                _totalSupplies[id] -= amount;
            }
        }
    }
}
