// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./common/GhostHash.sol";

library Merkle {
    function hashLeaf(uint256 n, bytes32 h) internal pure returns (bytes32) {
        // Domain separate with the block number to avoid ambiguity.
        return GhostHash.merkleLeaf(n, h);
    }

    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return GhostHash.merkleNode(a, b);
    }

    function verify(bytes32 root, bytes32 leaf, bytes32[] memory proof, uint256 index) internal pure returns (bool) {
        bytes32 computed = leaf;
        uint256 idx = index;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            if (idx & 1 == 0) {
                computed = hashPair(computed, sibling);
            } else {
                computed = hashPair(sibling, computed);
            }
            idx >>= 1;
        }
        return computed == root;
    }
}

