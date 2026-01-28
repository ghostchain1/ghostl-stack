// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal placeholder dispute game implementation. Not a full OP fault game,
///         but sufficient to unblock factory.version() / create() plumbing and give
///         challengers/proposers a real contract to call.
contract SimpleDisputeGame {
    uint8 public constant IN_PROGRESS = 0;
    uint8 public constant CHALLENGER_WON = 1;
    uint8 public constant DEFENDER_WON = 2;

    uint32 public immutable GAME_TYPE;

    uint64 public createdAt;
    uint8 public status;

    bytes32 public claim;
    uint256 public l2BlockNum;

    address public defender;
    address public challenger;

    bool public initialized;

    constructor(uint32 _gameType) {
        GAME_TYPE = _gameType;
    }

    function version() external pure returns (string memory) {
        return "SimpleDisputeGame/0.1";
    }

    function gameType() external view returns (uint32) {
        return GAME_TYPE;
    }

    function initialize(bytes calldata initData) external {
        require(!initialized, "ALREADY_INIT");
        initialized = true;

        (bytes32 _claim, uint256 _l2BlockNum, address _defender) =
            abi.decode(initData, (bytes32, uint256, address));

        claim = _claim;
        l2BlockNum = _l2BlockNum;
        defender = _defender;

        createdAt = uint64(block.timestamp);
        status = IN_PROGRESS;
    }

    function dispute(address _challenger) external {
        require(status == IN_PROGRESS, "NOT_ACTIVE");
        challenger = _challenger;
    }

    function resolveChallengerWins() external {
        require(status == IN_PROGRESS, "NOT_ACTIVE");
        status = CHALLENGER_WON;
    }

    function resolveDefenderWins() external {
        require(status == IN_PROGRESS, "NOT_ACTIVE");
        status = DEFENDER_WON;
    }
}
