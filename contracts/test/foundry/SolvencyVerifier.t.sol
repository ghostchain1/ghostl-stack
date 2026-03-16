// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/treasury/SolvencyVerifier.sol";

contract SolvencyVerifierTest is TestBase {
    address private constant GOVERNOR = address(0xA11CE);

    function testSubmitProofIncrementsEpoch() public {
        SolvencyVerifier verifier = new SolvencyVerifier(GOVERNOR, address(0));

        vm.prank(GOVERNOR);
        verifier.submitProof(hex"01", keccak256("assets"), keccak256("liabilities"), keccak256("net"), 1);
        assertEq(verifier.latestEpoch(), 1, "epoch mismatch");
    }

    function testRejectsEmptyProofWithoutExternalVerifier() public {
        SolvencyVerifier verifier = new SolvencyVerifier(GOVERNOR, address(0));
        vm.prank(GOVERNOR);
        vm.expectRevert(bytes("invalid_proof"));
        verifier.submitProof(bytes(""), keccak256("assets"), keccak256("liabilities"), keccak256("net"), 1);
    }
}
