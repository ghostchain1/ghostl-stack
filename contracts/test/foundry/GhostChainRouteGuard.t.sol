// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/l1/ValidatorRegistry.sol";
import "../../src/consensus-governance/GhostChainRouteGuard.sol";

contract GhostChainRouteGuardTest is TestBase {
    address private constant GOVERNOR = address(0xB0B);
    address private constant TIMELOCK = address(0xBEEF);
    address private constant RELAYER = address(0x1111);
    uint8 private constant SOURCE_LAYER_L1 = 1;

    uint256 private constant PK_VALIDATOR_1 = 0xA11CE;
    uint256 private constant PK_VALIDATOR_2 = 0xB0B0;
    uint256 private constant PK_VALIDATOR_3 = 0xC0DE;

    ValidatorRegistry private validatorRegistry;
    GhostChainRouteGuard private routeGuard;

    address private validator1;
    address private validator2;
    address private validator3;

    function setUp() public {
        validatorRegistry = new ValidatorRegistry();

        validator1 = vm.addr(PK_VALIDATOR_1);
        validator2 = vm.addr(PK_VALIDATOR_2);
        validator3 = vm.addr(PK_VALIDATOR_3);

        validatorRegistry.addValidator(validator1);
        validatorRegistry.addValidator(validator2);
        validatorRegistry.addValidator(validator3);

        routeGuard = new GhostChainRouteGuard(GOVERNOR, TIMELOCK, validatorRegistry, 2, 2);

        vm.prank(GOVERNOR);
        routeGuard.setRelayer(RELAYER, true);
    }

    function testAcceptsFinalityWithValidatorThreshold() public {
        GhostChainRouteGuard.FinalityAttestation memory att = GhostChainRouteGuard.FinalityAttestation({
            sourceLayer: SOURCE_LAYER_L1,
            root: keccak256("ghostchain-root-1"),
            ghostChainBlockNumber: 10_001,
            validUntil: uint64(block.timestamp + 1 hours),
            nonce: 1
        });

        bytes32 digest = _digestFor(att);
        bytes[] memory signatures = new bytes[](2);
        signatures[0] = _sign(PK_VALIDATOR_1, digest);
        signatures[1] = _sign(PK_VALIDATOR_2, digest);

        vm.prank(RELAYER);
        routeGuard.submitFinalityAttestation(att, signatures);

        assertTrue(routeGuard.isFinalizedRoot(SOURCE_LAYER_L1, att.root), "root finalized");
    }

    function testRejectsInsufficientSigners() public {
        GhostChainRouteGuard.FinalityAttestation memory att = GhostChainRouteGuard.FinalityAttestation({
            sourceLayer: SOURCE_LAYER_L1,
            root: keccak256("ghostchain-root-2"),
            ghostChainBlockNumber: 10_002,
            validUntil: uint64(block.timestamp + 1 hours),
            nonce: 2
        });

        bytes32 digest = _digestFor(att);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _sign(PK_VALIDATOR_1, digest);

        vm.prank(RELAYER);
        vm.expectRevert(abi.encodeWithSelector(GhostChainRouteGuard.NotEnoughSigners.selector, uint256(1), uint256(2)));
        routeGuard.submitFinalityAttestation(att, signatures);
    }

    function testRequireFinalizedRootRevertsWhenMissing() public {
        bytes32 root = keccak256("missing-root");
        bytes32 rootKey = keccak256(abi.encode(SOURCE_LAYER_L1, root));
        vm.expectRevert(
            abi.encodeWithSelector(
                GhostChainRouteGuard.RootNotFinalized.selector,
                rootKey
            )
        );
        routeGuard.requireFinalizedRoot(SOURCE_LAYER_L1, root);
    }

    function _digestFor(GhostChainRouteGuard.FinalityAttestation memory att) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(routeGuard),
                block.chainid,
                uint8(2),
                att.sourceLayer,
                att.root,
                att.ghostChainBlockNumber,
                att.validUntil,
                att.nonce
            )
        );
    }

    function _sign(uint256 privateKey, bytes32 digest) internal returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        sig = abi.encodePacked(r, s, v);
    }
}
