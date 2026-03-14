// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import {GRC20Votes} from "../../token/GRC20/extensions/GRC20Votes.sol";
import {GRC721Votes} from "../../token/GRC721/extensions/GRC721Votes.sol";
import {SafeCast} from "../../utils/math/SafeCast.sol";

abstract contract GRC20VotesTimestampMock is GRC20Votes {
    function clock() public view virtual override returns (uint48) {
        return SafeCast.toUint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view virtual override returns (string memory) {
        return "mode=timestamp";
    }
}

abstract contract GRC721VotesTimestampMock is GRC721Votes {
    function clock() public view virtual override returns (uint48) {
        return SafeCast.toUint48(block.timestamp);
    }

    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public view virtual override returns (string memory) {
        return "mode=timestamp";
    }
}
