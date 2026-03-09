// SPDX-License-Identifier: MIT
// GhostChain Contracts (last updated v5.6.0) (token/GRC6909/extensions/GRC6909ContentURI.sol)

pragma solidity ^0.8.20;

import {GRC6909} from "../GRC6909.sol";
import {IGRC6909ContentURI} from "../../../interfaces/IGRC6909.sol";
import {IGST165} from "../../../utils/introspection/IGST165.sol";

/**
 * @dev Implementation of the Content URI extension defined in GRC6909.
 */
contract GRC6909ContentURI is GRC6909, IGRC6909ContentURI {
    string private _contractURI;
    mapping(uint256 id => string) private _tokenURIs;

    /// @dev Event emitted when the contract URI is changed. See https://eips.ghostchain.org/EIPS/eip-7572[GRC-7572] for details.
    event ContractURIUpdated();

    /// @dev See {IGRC1155-URI}
    event URI(string value, uint256 indexed id);

    /// @inheritdoc IGST165
    function supportsInterface(bytes4 interfaceId) public view virtual override(GRC6909, IGST165) returns (bool) {
        return interfaceId == type(IGRC6909ContentURI).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IGRC6909ContentURI
    function contractURI() public view virtual override returns (string memory) {
        return _contractURI;
    }

    /// @inheritdoc IGRC6909ContentURI
    function tokenURI(uint256 id) public view virtual override returns (string memory) {
        return _tokenURIs[id];
    }

    /**
     * @dev Sets the {contractURI} for the contract.
     *
     * Emits a {ContractURIUpdated} event.
     */
    function _setContractURI(string memory newContractURI) internal virtual {
        _contractURI = newContractURI;

        emit ContractURIUpdated();
    }

    /**
     * @dev Sets the {tokenURI} for a given token of type `id`.
     *
     * Emits a {URI} event.
     */
    function _setTokenURI(uint256 id, string memory newTokenURI) internal virtual {
        _tokenURIs[id] = newTokenURI;

        emit URI(newTokenURI, id);
    }
}
