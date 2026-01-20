// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDisputeGame {
    function gameType() external view returns (uint32);
    function createdAt() external view returns (uint64);
    function status() external view returns (uint8);
}

interface IGameClone {
    function initialize(bytes calldata initData) external;
}

/// @notice Minimal dispute game factory that supports version(), setting implementations,
///         and creating clone-based games. This is intentionally lightweight to unblock
///         offchain challengers/proposers expecting a real contract at the factory address.
contract DisputeGameFactory {
    error Unauthorized();
    error GameTypeNotSet(uint32 gameType);
    error GameAlreadyExists(bytes32 gameId);

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event ImplementationSet(uint32 indexed gameType, address indexed impl);
    event GameCreated(bytes32 indexed gameId, uint32 indexed gameType, address indexed game, bytes initData);

    address public owner;

    // gameType => implementation (must be cloneable and safe to initialize)
    mapping(uint32 => address) public implementations;
    // gameId => deployed game address
    mapping(bytes32 => address) public games;
    address[] public allGames;

    constructor(address _owner) {
        owner = _owner;
        emit OwnerChanged(address(0), _owner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function version() external pure returns (string memory) {
        return "DGF/1.0.0-minimal";
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function setImplementation(uint32 gameType, address impl) external onlyOwner {
        implementations[gameType] = impl;
        emit ImplementationSet(gameType, impl);
    }

    function computeGameId(uint32 gameType, bytes calldata initData) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(gameType, keccak256(initData)));
    }

    function create(uint32 gameType, bytes calldata initData) external returns (address game) {
        address impl = implementations[gameType];
        if (impl == address(0)) revert GameTypeNotSet(gameType);

        bytes32 gameId = computeGameId(gameType, initData);
        if (games[gameId] != address(0)) revert GameAlreadyExists(gameId);

        game = _clone(impl);
        games[gameId] = game;
        allGames.push(game);
        IGameClone(game).initialize(initData);

        emit GameCreated(gameId, gameType, game, initData);
    }

    function allGamesLength() external view returns (uint256) {
        return allGames.length;
    }

    // EIP-1167 minimal proxy clone
    function _clone(address impl) internal returns (address instance) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 0x14), shl(0x60, impl))
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 0x37)
        }
        require(instance != address(0), "CLONE_FAIL");
    }
}
