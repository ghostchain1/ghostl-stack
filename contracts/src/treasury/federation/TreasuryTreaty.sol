// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

/// @notice Treaty constraints for federated treasury actions.
contract TreasuryTreaty {
    address public immutable router;
    uint256 public immutable partnerChainId;
    address public immutable partnerTreasury;
    uint256 public immutable cap;
    uint256 public immutable startTime;
    uint256 public immutable endTime;
    uint256 public immutable exitDelay;
    bytes32 public immutable purposeHash;

    uint256 public totalDrawn;
    bool public exitRequested;
    uint256 public exitRequestedAt;
    bool public exitFinalized;

    event DrawRecorded(uint256 amount, address asset, address recipient, uint256 totalDrawn);
    event ExitRequested(uint256 when);
    event ExitFinalized(uint256 when);

    error NotRouter();
    error TreatyInactive();
    error CapExceeded(uint256 cap, uint256 requested);
    error ExitPending();
    error ExitNotReady();

    constructor(
        address router_,
        uint256 partnerChainId_,
        address partnerTreasury_,
        uint256 cap_,
        uint256 startTime_,
        uint256 endTime_,
        uint256 exitDelay_,
        bytes32 purposeHash_
    ) {
        require(router_ != address(0), "router=0");
        require(partnerChainId_ != 0, "chainId=0");
        require(partnerTreasury_ != address(0), "partner=0");
        require(endTime_ == 0 || endTime_ > startTime_, "end<=start");
        router = router_;
        partnerChainId = partnerChainId_;
        partnerTreasury = partnerTreasury_;
        cap = cap_;
        startTime = startTime_;
        endTime = endTime_;
        exitDelay = exitDelay_;
        purposeHash = purposeHash_;
    }

    modifier onlyRouter() {
        if (msg.sender != router) revert NotRouter();
        _;
    }

    function isActive() public view returns (bool) {
        if (exitFinalized) return false;
        if (block.timestamp < startTime) return false;
        if (endTime != 0 && block.timestamp > endTime) return false;
        return true;
    }

    function canDraw(uint256 amount) public view returns (bool) {
        if (!isActive()) return false;
        if (exitRequested) return false;
        if (totalDrawn + amount > cap) return false;
        return true;
    }

    function recordDraw(uint256 amount, address asset, address recipient) external onlyRouter {
        if (!isActive()) revert TreatyInactive();
        if (exitRequested) revert ExitPending();
        if (totalDrawn + amount > cap) revert CapExceeded(cap, totalDrawn + amount);
        totalDrawn += amount;
        emit DrawRecorded(amount, asset, recipient, totalDrawn);
    }

    function requestExit() external onlyRouter {
        if (!isActive()) revert TreatyInactive();
        if (!exitRequested) {
            exitRequested = true;
            exitRequestedAt = block.timestamp;
            emit ExitRequested(exitRequestedAt);
        }
    }

    function finalizeExit() external onlyRouter {
        if (!exitRequested) revert ExitPending();
        if (block.timestamp < exitRequestedAt + exitDelay) revert ExitNotReady();
        exitFinalized = true;
        emit ExitFinalized(block.timestamp);
    }
}
