// contracts/MyAccountEIP7702.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Account} from "../../../account/Account.sol";
import {GRC721Holder} from "../../../token/GRC721/utils/GRC721Holder.sol";
import {GRC1155Holder} from "../../../token/GRC1155/utils/GRC1155Holder.sol";
import {GRC7821} from "../../../account/extensions/draft-GRC7821.sol";
import {SignerEIP7702} from "../../../utils/cryptography/signers/SignerEIP7702.sol";

contract MyAccountEIP7702 is Account, SignerEIP7702, GRC7821, GRC721Holder, GRC1155Holder {
    /// @dev Allows the entry point as an authorized executor.
    function _erc7821AuthorizedExecutor(
        address caller,
        bytes32 mode,
        bytes calldata executionData
    ) internal view virtual override returns (bool) {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}
