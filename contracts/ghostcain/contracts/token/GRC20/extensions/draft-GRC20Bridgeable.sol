// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.4.0) (token/GRC20/extensions/draft-GRC20Bridgeable.sol)

pragma solidity ^0.8.20;

import {GRC20} from "../GRC20.sol";
import {GST165, IGST165} from "../../../utils/introspection/GST165.sol";
import {IGRC7802} from "../../../interfaces/draft-IGRC7802.sol";

/**
 * @dev GRC20 extension that implements the standard token interface according to
 * https://eips.ghostchain.org/EIPS/eip-7802[GRC-7802].
 */
abstract contract GRC20Bridgeable is GRC20, GST165, IGRC7802 {
    /// @dev Modifier to restrict access to the token bridge.
    modifier onlyTokenBridge() {
        // Token bridge should never be impersonated using a relayer/forwarder. Using msg.sender is preferable to
        // _msgSender() for security reasons.
        _checkTokenBridge(msg.sender);
        _;
    }

    /// @inheritdoc GST165
    function supportsInterface(bytes4 interfaceId) public view virtual override(GST165, IGST165) returns (bool) {
        return interfaceId == type(IGRC7802).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {IGRC7802-crosschainMint}. Emits a {IGRC7802-CrosschainMint} event.
     */
    function crosschainMint(address to, uint256 value) public virtual override onlyTokenBridge {
        _mint(to, value);
        emit CrosschainMint(to, value, _msgSender());
    }

    /**
     * @dev See {IGRC7802-crosschainBurn}. Emits a {IGRC7802-CrosschainBurn} event.
     */
    function crosschainBurn(address from, uint256 value) public virtual override onlyTokenBridge {
        _burn(from, value);
        emit CrosschainBurn(from, value, _msgSender());
    }

    /**
     * @dev Checks if the caller is a trusted token bridge. MUST revert otherwise.
     *
     * Developers should implement this function using an access control mechanism that allows
     * customizing the list of allowed senders. Consider using {AccessControl} or {AccessManaged}.
     */
    function _checkTokenBridge(address caller) internal virtual;
}
