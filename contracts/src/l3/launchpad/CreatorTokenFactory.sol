// GhostChain Contracts v5.6.1 (contracts/src/l3/launchpad/CreatorTokenFactory.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../../GhostBrand.sol";
import {GhostOwnable} from "../../ghost/GhostOwnable.sol";
import {GhostReentrancyGuard} from "../../ghost/GhostReentrancyGuard.sol";
import {CreatorToken} from "./CreatorToken.sol";

/// @title  CreatorTokenFactory
/// @notice Governance-locked factory for deploying CreatorToken contracts on GhostL3.
///         Enforces a one-token-per-creator invariant. Keeps an on-chain registry so
///         explorers and bridges can discover launches without off-chain indexing.
contract CreatorTokenFactory is GhostBrand, GhostOwnable, GhostReentrancyGuard {
    // ── Errors ────────────────────────────────────────────────────────────────
    error Factory__WrongChain(uint256 expected, uint256 actual);
    error Factory__AlreadyLaunched(address creator);
    error Factory__InvalidParams();
    error Factory__CallerNotCreator();

    // ── Events ────────────────────────────────────────────────────────────────
    event TokenLaunched(
        address indexed creator,
        address indexed token,
        string          name,
        string          symbol,
        uint256         maxSupply,
        uint256         timestamp
    );

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice Registered token address for each creator (0 = not yet launched)
    mapping(address => address) public creatorToken;

    /// @notice Ordered list of all launched token addresses
    address[] private _tokens;

    /// @notice Authorised minter override (default: factory owner — typically the sale engine)
    address public defaultMinter;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _admin         Initial factory owner (GhostChain governance multisig)
    /// @param _defaultMinter Address granted minting rights on all future tokens
    constructor(address _admin, address _defaultMinter) GhostOwnable(_admin) {
        if (_defaultMinter == address(0)) revert Factory__InvalidParams();
        defaultMinter = _defaultMinter;
    }

    // ── Launch ────────────────────────────────────────────────────────────────

    /// @notice Deploys a new CreatorToken for the calling creator.
    ///         Caller must be the creator — no proxying.
    /// @param name       Fan token full name (e.g. "Nova Fan Token")
    /// @param symbol     Ticker (e.g. "NOVA") — max 10 chars recommended
    /// @param maxSupply  Hard cap in 18-decimal base units
    function launch(
        string calldata name,
        string calldata symbol,
        uint256         maxSupply
    ) external nonReentrant returns (address token) {
        if (block.chainid != L3_CHAIN_ID) revert Factory__WrongChain(L3_CHAIN_ID, block.chainid);
        if (creatorToken[msg.sender] != address(0)) revert Factory__AlreadyLaunched(msg.sender);
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert Factory__InvalidParams();
        if (maxSupply == 0) revert Factory__InvalidParams();

        token = address(new CreatorToken(name, symbol, msg.sender, maxSupply, defaultMinter));
        creatorToken[msg.sender] = token;
        _tokens.push(token);

        emit TokenLaunched(msg.sender, token, name, symbol, maxSupply, block.timestamp);
    }

    // ── Registry reads ────────────────────────────────────────────────────────

    /// @notice Total number of creator tokens launched.
    function totalTokens() external view returns (uint256) {
        return _tokens.length;
    }

    /// @notice Paginated list of launched token addresses.
    /// @param offset  Start index (inclusive)
    /// @param limit   Maximum number of results
    function listTokens(uint256 offset, uint256 limit) external view returns (address[] memory out) {
        uint256 len = _tokens.length;
        if (offset >= len) return out;
        uint256 end = offset + limit;
        if (end > len) end = len;
        out = new address[](end - offset);
        for (uint256 i = offset; i < end; ) {
            out[i - offset] = _tokens[i];
            unchecked { ++i; }
        }
    }

    // ── Owner-only admin ──────────────────────────────────────────────────────

    /// @notice Update the default minter granted to future token deployments.
    function setDefaultMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert Factory__InvalidParams();
        defaultMinter = _minter;
    }
}
