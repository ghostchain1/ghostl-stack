// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

import "./TestBase.sol";
import "../../src/common/Ownable.sol";
import "../../src/l1/ChainConfig.sol";
import "../../src/l1/SystemConfig.sol";
import "../../src/l1/RollupManager.sol";
import "../../src/l1/L2OutputOracle.sol";
import "../../src/l1/Portal.sol";
import "../../src/l1/Messenger.sol";
import "../../src/l1/ValidatorRegistry.sol";
import "../../src/l1/EmergencyShutdown.sol";
import "../../src/l1/PauseGuardian.sol";

contract L1Invariants is TestBase {
    address private constant PROPOSER = address(0xB0B);
    address private constant ATTACKER = address(0xBEEF);

    function testGovernanceOnlyConfigChanges() public {
        ChainConfig chainConfig = new ChainConfig();
        SystemConfig systemConfig = new SystemConfig(address(0x1), address(0x2), 30_000_000, 2100, 10);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        chainConfig.setConfig(keccak256("forkBlock"), 123);

        chainConfig.setConfig(keccak256("forkBlock"), 123);
        assertEq(chainConfig.getConfig(keccak256("forkBlock")), 123, "chain config set");

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        systemConfig.setBatcher(address(0x3));

        systemConfig.setBatcher(address(0x3));
        assertEq(systemConfig.batcher(), address(0x3), "batcher set");
    }

    function testValidatorRegistryControls() public {
        ValidatorRegistry registry = new ValidatorRegistry();

        vm.expectRevert(bytes("validator=0"));
        registry.addValidator(address(0));

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        registry.addValidator(address(0x1234));

        registry.addValidator(address(0x1234));
        assertTrue(registry.isValidator(address(0x1234)), "validator added");

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        registry.removeValidator(address(0x1234));

        registry.removeValidator(address(0x1234));
        assertTrue(!registry.isValidator(address(0x1234)), "validator removed");
    }

    function testBridgeFacingInvariants() public {
        L2OutputOracle l2oo = new L2OutputOracle(PROPOSER);
        Portal portal = new Portal();
        Messenger messenger = new Messenger();
        SystemConfig systemConfig = new SystemConfig(address(0x1), address(0x2), 30_000_000, 2100, 10);
        RollupManager rollup = new RollupManager(l2oo, portal, messenger, systemConfig);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(L2OutputOracle.NotProposer.selector));
        l2oo.proposeOutput(bytes32("root"), 100);

        vm.prank(PROPOSER);
        l2oo.proposeOutput(bytes32("root"), 100);
        assertEq(l2oo.latestBlockNumber(), 100, "latest block updated");
        assertEq(l2oo.outputsLength(), 1, "output recorded");

        vm.prank(PROPOSER);
        vm.expectRevert(abi.encodeWithSelector(L2OutputOracle.NonMonotonicBlockNumber.selector));
        l2oo.proposeOutput(bytes32("root2"), 99);

        vm.expectRevert(bytes("bad id"));
        messenger.relayMessage(1);

        uint256 msgId = messenger.sendMessage(address(0xCAFE), hex"");
        assertEq(msgId, 0, "first message id");
        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        messenger.relayMessage(msgId);

        messenger.relayMessage(msgId);
        assertEq(messenger.sentCount(), 1, "sent count");
        assertEq(messenger.relayedCount(), 1, "relayed count");

        L2OutputOracle l2oo2 = new L2OutputOracle(PROPOSER);
        Portal portal2 = new Portal();
        Messenger messenger2 = new Messenger();
        SystemConfig systemConfig2 = new SystemConfig(address(0x5), address(0x6), 30_000_000, 2100, 10);

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        rollup.setAddresses(l2oo2, portal2, messenger2, systemConfig2);

        rollup.setAddresses(l2oo2, portal2, messenger2, systemConfig2);
        assertEq(address(rollup.l2oo()), address(l2oo2), "rollup l2oo set");
        assertEq(address(rollup.portal()), address(portal2), "rollup portal set");
        assertEq(address(rollup.messenger()), address(messenger2), "rollup messenger set");
        assertEq(address(rollup.systemConfig()), address(systemConfig2), "rollup system config set");
    }

    function testEmergencyModeGuards() public {
        EmergencyShutdown shutdown = new EmergencyShutdown();
        PauseGuardian pause = new PauseGuardian();

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        shutdown.trigger("incident");

        shutdown.trigger("incident");
        assertTrue(shutdown.shutdown(), "shutdown on");
        assertTrue(keccak256(bytes(shutdown.reason())) == keccak256(bytes("incident")), "reason set");

        shutdown.clear();
        assertTrue(!shutdown.shutdown(), "shutdown cleared");
        assertTrue(keccak256(bytes(shutdown.reason())) == keccak256(bytes("")), "reason cleared");

        vm.prank(ATTACKER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.NotOwner.selector));
        pause.setPaused(true);

        pause.setPaused(true);
        assertTrue(pause.paused(), "paused");
        pause.setPaused(false);
        assertTrue(!pause.paused(), "unpaused");
    }
}
