// GhostChain Contracts v5.6.1 (contracts/src/l3/AgencyRevenue.sol)
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GhostBrand} from "../GhostBrand.sol";
import {IGRC20} from "../ghost/IGRC20.sol";
import {GhostReentrancyGuard} from "../ghost/GhostReentrancyGuard.sol";
import {GhostOwnable} from "../ghost/GhostOwnable.sol";

/// @title AgencyRevenue
/// @notice Splits creator GST revenue 60/30/10 (creator / agency / platform)
///         on GhostL3 (chain 903).
contract AgencyRevenue is GhostBrand, GhostReentrancyGuard, GhostOwnable {
    error WrongChain(uint256 expected, uint256 actual);
    error ZeroAmount();
    error TransferFailed();

    event RevenueSplit(
        address indexed creator,
        address indexed agency,
        uint256 creatorShare,
        uint256 agencyShare,
        uint256 platformShare
    );

    IGRC20  public immutable GST_TOKEN;
    address public platformWallet;

    // Basis points (must sum to 10000)
    uint256 public creatorBps  = 6000; // 60%
    uint256 public agencyBps   = 3000; // 30%
    uint256 public platformBps = 1000; // 10%

    constructor(address _gstToken, address _platformWallet) GhostOwnable(msg.sender) {
        GST_TOKEN = IGRC20(_gstToken);
        platformWallet = _platformWallet;
    }

    function split(
        address creator,
        address agency,
        uint256 amount
    ) external nonReentrant {
        if (block.chainid != L3_CHAIN_ID) revert WrongChain(L3_CHAIN_ID, block.chainid);
        if (amount == 0) revert ZeroAmount();

        uint256 creatorShare  = (amount * creatorBps)  / 10_000;
        uint256 agencyShare   = (amount * agencyBps)   / 10_000;
        uint256 platformShare = amount - creatorShare - agencyShare;

        require(GST_TOKEN.transferFrom(msg.sender, creator, creatorShare),   "Creator xfer failed");
        require(GST_TOKEN.transferFrom(msg.sender, agency, agencyShare),     "Agency xfer failed");
        require(GST_TOKEN.transferFrom(msg.sender, platformWallet, platformShare), "Platform xfer failed");

        emit RevenueSplit(creator, agency, creatorShare, agencyShare, platformShare);
    }

    function updateSplit(uint256 _creatorBps, uint256 _agencyBps) external onlyOwner {
        require(_creatorBps + _agencyBps <= 9500, "Must leave >= 5% for platform");
        creatorBps  = _creatorBps;
        agencyBps   = _agencyBps;
        platformBps = 10_000 - _creatorBps - _agencyBps;
    }
}
