// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @dev Minimal L2 Output Oracle mock to satisfy op-proposer locally.
/// Stores the last submitted output; not production-safe.
contract L2OutputOracleMock {
    struct OutputProposal {
        bytes32 outputRoot;
        uint256 timestamp;
        uint256 l2BlockNumber;
        bytes32 l1BlockHash;
        uint256 l1BlockNumber;
    }

    OutputProposal public latest;
    uint256 private _latestOutputIndex;

    // Mirrors the op-proposer expectation from the production L2OO.
    function version() external pure returns (string memory) {
        return "mock-1.0.0";
    }

    function nextBlockNumber() external view returns (uint256) {
        return latest.l2BlockNumber + 1;
    }

    function latestOutputIndex() external view returns (uint256) {
        return _latestOutputIndex;
    }

    function latestBlockNumber() external view returns (uint256) {
        return latest.l2BlockNumber;
    }

    function getL2Output(uint256 index) external view returns (OutputProposal memory) {
        require(index == _latestOutputIndex, "index mismatch");
        return latest;
    }

    function computeL2Timestamp(uint256 /* l2BlockNumber */) public view returns (uint256) {
        return block.timestamp;
    }

    function submitL2Output(
        bytes32 outputRoot,
        uint256 l2BlockNumber,
        bytes32 l1BlockHash,
        uint256 l1BlockNumber
    ) public {
        latest = OutputProposal({
            outputRoot: outputRoot,
            timestamp: block.timestamp,
            l2BlockNumber: l2BlockNumber,
            l1BlockHash: l1BlockHash,
            l1BlockNumber: l1BlockNumber
        });
        _latestOutputIndex += 1;
    }

    // Alias for compatibility with the canonical L2OutputOracle ABI.
    function proposeL2Output(
        bytes32 outputRoot,
        uint256 l2BlockNumber,
        bytes32 l1BlockHash,
        uint256 l1BlockNumber
    ) external {
        submitL2Output(outputRoot, l2BlockNumber, l1BlockHash, l1BlockNumber);
    }
}
