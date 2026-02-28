// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Governed.sol";

interface IZkSolvencyVerifier {
    function verifyProof(bytes calldata proof, bytes32 assetsRoot, bytes32 liabilitiesRoot, bytes32 netPositionRoot, uint256 epoch)
        external
        view
        returns (bool);
}

/// @notice On-chain solvency verifier wrapper.
/// @dev Accepts proof validation either through configured zk verifier or fallback proof-bytes sanity.
contract SolvencyVerifier is Governed {
    address public zkVerifier;
    uint256 public latestEpoch;
    bytes32 public latestAssetsRoot;
    bytes32 public latestLiabilitiesRoot;
    bytes32 public latestNetPositionRoot;

    event ZkVerifierUpdated(address indexed previous, address indexed next);
    event SolvencyProofSubmitted(
        uint256 indexed epoch,
        bytes32 indexed assetsRoot,
        bytes32 indexed liabilitiesRoot,
        bytes32 netPositionRoot,
        bool verified
    );

    constructor(address governor_, address timelock_) Governed(governor_, timelock_) {}

    function setZkVerifier(address nextVerifier) external onlyGovernance {
        address previous = zkVerifier;
        zkVerifier = nextVerifier;
        emit ZkVerifierUpdated(previous, nextVerifier);
    }

    function verifyProof(bytes calldata proof, bytes32 assetsRoot, bytes32 liabilitiesRoot, bytes32 netPositionRoot, uint256 epoch)
        public
        view
        returns (bool)
    {
        if (zkVerifier == address(0)) {
            // Fallback branch for environments where external verifier is not yet configured.
            return proof.length > 0 && assetsRoot != bytes32(0) && liabilitiesRoot != bytes32(0) && netPositionRoot != bytes32(0)
                && epoch > 0;
        }
        return IZkSolvencyVerifier(zkVerifier).verifyProof(proof, assetsRoot, liabilitiesRoot, netPositionRoot, epoch);
    }

    function submitProof(bytes calldata proof, bytes32 assetsRoot, bytes32 liabilitiesRoot, bytes32 netPositionRoot, uint256 epoch)
        external
        onlyGovernance
        returns (bool)
    {
        require(epoch > latestEpoch, "epoch_not_increasing");
        bool ok = verifyProof(proof, assetsRoot, liabilitiesRoot, netPositionRoot, epoch);
        require(ok, "invalid_proof");

        latestEpoch = epoch;
        latestAssetsRoot = assetsRoot;
        latestLiabilitiesRoot = liabilitiesRoot;
        latestNetPositionRoot = netPositionRoot;

        emit SolvencyProofSubmitted(epoch, assetsRoot, liabilitiesRoot, netPositionRoot, true);
        return true;
    }
}
