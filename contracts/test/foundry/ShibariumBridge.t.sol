// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {ShibariumBridge} from "../../src/bridge/ShibariumBridge.sol";
import {ShibariumBridgeChild} from "../../src/bridge/ShibariumBridgeChild.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

contract MockERC20S {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public bridge;

    event Transfer(address indexed from, address indexed to, uint256 amount);

    constructor(address _bridge) { bridge = _bridge; }

    function mint(address to, uint256 amount) external {
        require(msg.sender == bridge, "not bridge");
        totalSupply     += amount;
        balanceOf[to]   += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == bridge, "not bridge");
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        totalSupply     -= amount;
        emit Transfer(from, address(0), amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @dev Records all calls; mimics FxERC20RootTunnel.
contract MockFxRootTunnel {
    event Mapped(address rootToken, address childToken);
    event Deposited(address rootToken, address user, uint256 amount, bytes data);
    event Exited(bytes proof);

    bool public mapped;
    uint256 public depositCount;

    function mapToken(address rootToken, address childToken) external {
        mapped = true;
        emit Mapped(rootToken, childToken);
    }

    function deposit(address rootToken, address user, uint256 amount, bytes calldata data) external {
        ++depositCount;
        emit Deposited(rootToken, user, amount, data);
    }

    function exit(bytes calldata inputData) external {
        emit Exited(inputData);
    }
}

/// @dev Simple ERC-20 to stand in for GST on L1.
contract MockGST {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);

    function mint(address to, uint256 amount) external {
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ShibariumBridge (L1) tests
// ─────────────────────────────────────────────────────────────────────────────

contract ShibariumBridgeTest is Test {
    MockGST          gst;
    MockFxRootTunnel fxTunnel;
    ShibariumBridge  bridge;

    address governor  = address(0xA1);
    address operator  = address(0xA2);
    address alice     = address(0xA3);
    address childGST_ = address(0xC001);

    function setUp() public {
        gst      = new MockGST();
        fxTunnel = new MockFxRootTunnel();

        vm.prank(governor);
        bridge = new ShibariumBridge(
            address(gst),
            address(fxTunnel),
            childGST_,
            governor,
            address(0)
        );

        // Authorise operator
        vm.prank(governor);
        bridge.setOperator(operator, true);

        // Fund alice with GST
        gst.mint(alice, 1_000_000e18);
    }

    // ── mapToken ─────────────────────────────────────────────────────────────

    function test_mapToken_succeeds() public {
        vm.prank(governor);
        bridge.mapToken();
        assertTrue(bridge.tokenMapped(), "token should be mapped");
        assertTrue(fxTunnel.mapped(), "fxTunnel.mapped should be set");
    }

    function test_mapToken_revertIfAlreadyMapped() public {
        vm.prank(governor);
        bridge.mapToken();

        vm.prank(governor);
        vm.expectRevert(ShibariumBridge.AlreadyMapped.selector);
        bridge.mapToken();
    }

    function test_mapToken_revertIfNotGovernance() public {
        vm.prank(alice);
        vm.expectRevert();
        bridge.mapToken();
    }

    // ── bridgeERC20To ────────────────────────────────────────────────────────

    function test_bridgeERC20To_basic() public {
        vm.prank(governor);
        bridge.mapToken();

        uint256 amount = 50_000e18;
        vm.startPrank(alice);
        gst.approve(address(bridge), amount);
        vm.stopPrank();

        // Must be called by an operator; fund operator allowance via alice
        gst.mint(operator, amount);
        vm.startPrank(operator);
        gst.approve(address(bridge), amount);
        bridge.bridgeERC20To(address(gst), childGST_, alice, amount, 200_000, bytes(""));
        vm.stopPrank();

        assertEq(bridge.totalDeposited(), amount, "totalDeposited updated");
        assertEq(fxTunnel.depositCount(), 1, "fxTunnel.deposit called once");
    }

    function test_bridgeERC20To_revertIfNotMapped() public {
        gst.mint(operator, 1e18);
        vm.startPrank(operator);
        gst.approve(address(bridge), 1e18);
        vm.expectRevert(ShibariumBridge.TokenNotMapped.selector);
        bridge.bridgeERC20To(address(gst), childGST_, alice, 1e18, 200_000, bytes(""));
        vm.stopPrank();
    }

    function test_bridgeERC20To_revertWrongLocalToken() public {
        vm.prank(governor);
        bridge.mapToken();

        gst.mint(operator, 1e18);
        vm.startPrank(operator);
        gst.approve(address(bridge), 1e18);
        vm.expectRevert("ShibariumBridge: wrong local token");
        bridge.bridgeERC20To(address(0xBAD), childGST_, alice, 1e18, 200_000, bytes(""));
        vm.stopPrank();
    }

    function test_bridgeERC20To_revertWrongRemoteToken() public {
        vm.prank(governor);
        bridge.mapToken();

        gst.mint(operator, 1e18);
        vm.startPrank(operator);
        gst.approve(address(bridge), 1e18);
        vm.expectRevert("ShibariumBridge: wrong remote token");
        bridge.bridgeERC20To(address(gst), address(0xBAD), alice, 1e18, 200_000, bytes(""));
        vm.stopPrank();
    }

    function test_bridgeERC20To_revertNotOperator() public {
        vm.prank(governor);
        bridge.mapToken();

        gst.mint(alice, 1e18);
        vm.startPrank(alice);
        gst.approve(address(bridge), 1e18);
        vm.expectRevert(abi.encodeWithSelector(ShibariumBridge.NotOperator.selector, alice));
        bridge.bridgeERC20To(address(gst), childGST_, alice, 1e18, 200_000, bytes(""));
        vm.stopPrank();
    }

    function test_bridgeERC20To_revertWhenPaused() public {
        vm.prank(governor);
        bridge.mapToken();
        vm.prank(governor);
        bridge.setPaused(true);

        gst.mint(operator, 1e18);
        vm.startPrank(operator);
        gst.approve(address(bridge), 1e18);
        vm.expectRevert(ShibariumBridge.Halted.selector);
        bridge.bridgeERC20To(address(gst), childGST_, alice, 1e18, 200_000, bytes(""));
        vm.stopPrank();
    }

    // ── requestWithdrawal / finaliseWithdrawal ───────────────────────────────

    function test_requestWithdrawal_recorded() public {
        vm.prank(operator);
        uint256 nonce = bridge.requestWithdrawal(alice, 10_000e18);
        assertEq(nonce, 1, "nonce = 1");

        (address receiver, uint256 amount,, bool finalised) = bridge.getWithdrawal(1);
        assertEq(receiver, alice, "receiver");
        assertEq(amount, 10_000e18, "amount");
        assertFalse(finalised, "not yet finalised");
    }

    function test_finaliseWithdrawal_callsExit() public {
        vm.prank(operator);
        uint256 nonce = bridge.requestWithdrawal(alice, 10_000e18);

        bytes memory proof = abi.encode("fake-proof");
        vm.prank(operator);
        bridge.finaliseWithdrawal(nonce, proof);

        (,,, bool finalised) = bridge.getWithdrawal(nonce);
        assertTrue(finalised, "should be finalised");
        assertEq(bridge.totalWithdrawn(), 10_000e18, "totalWithdrawn updated");
    }

    function test_finaliseWithdrawal_revertDoubleFinalization() public {
        vm.prank(operator);
        uint256 nonce = bridge.requestWithdrawal(alice, 1e18);

        bytes memory proof = abi.encode("proof");
        vm.prank(operator);
        bridge.finaliseWithdrawal(nonce, proof);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ShibariumBridge.WithdrawalAlreadyFinalised.selector, nonce));
        bridge.finaliseWithdrawal(nonce, proof);
    }

    // ── inTransit ────────────────────────────────────────────────────────────

    function test_inTransit_accounting() public {
        vm.prank(governor);
        bridge.mapToken();

        gst.mint(operator, 100e18);
        vm.startPrank(operator);
        gst.approve(address(bridge), 100e18);
        bridge.bridgeERC20To(address(gst), childGST_, alice, 100e18, 200_000, bytes(""));
        vm.stopPrank();

        assertEq(bridge.inTransit(), 100e18);

        vm.prank(operator);
        uint256 nonce = bridge.requestWithdrawal(alice, 40e18);
        vm.prank(operator);
        bridge.finaliseWithdrawal(nonce, bytes("proof"));

        assertEq(bridge.inTransit(), 60e18);
    }

    // ── governance setters ───────────────────────────────────────────────────

    function test_setChildGST_beforeMapping() public {
        address newChild = address(0xC002);
        vm.prank(governor);
        bridge.setChildGST(newChild);
        assertEq(bridge.childGST(), newChild);
    }

    function test_setChildGST_revertAfterMapping() public {
        vm.prank(governor);
        bridge.mapToken();

        vm.prank(governor);
        vm.expectRevert(ShibariumBridge.AlreadyMapped.selector);
        bridge.setChildGST(address(0xC003));
    }

    function test_emergencyWithdraw_onlyWhenPaused() public {
        vm.prank(governor);
        bridge.mapToken();

        gst.mint(address(bridge), 500e18);

        // Should revert if not paused
        vm.prank(governor);
        vm.expectRevert("ShibariumBridge: not paused");
        bridge.emergencyWithdraw(alice, 500e18);

        vm.prank(governor);
        bridge.setPaused(true);

        uint256 before = gst.balanceOf(alice);
        vm.prank(governor);
        bridge.emergencyWithdraw(alice, 500e18);
        assertEq(gst.balanceOf(alice), before + 500e18);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ShibariumBridgeChild tests
// ─────────────────────────────────────────────────────────────────────────────

contract ShibariumBridgeChildTest is Test {
    ShibariumBridgeChild  child;
    MockERC20S            gstS;

    address fxChild    = address(0xFC);
    address rootTunnel = address(0x1234567890123456789012345678901234567890);
    address owner_     = address(0xD1);
    address alice      = address(0xD2);
    address l1Alice    = address(0xD3);

    function setUp() public {
        // Deploy child first with placeholder gstS address, then wire up
        vm.prank(owner_);
        child = new ShibariumBridgeChild(
            address(1), // placeholder — overwrite below
            fxChild,
            rootTunnel
        );

        // Deploy gstS with child as bridge
        gstS = new MockERC20S(address(child));

        // Re-deploy child with correct gstS address
        vm.prank(owner_);
        child = new ShibariumBridgeChild(address(gstS), fxChild, rootTunnel);
    }

    // ── processMessageFromRoot ───────────────────────────────────────────────

    function test_processMessage_mintsToRecipient() public {
        bytes memory data = abi.encode(alice, uint256(1_000e18), bytes(""));

        vm.prank(fxChild);
        child.processMessageFromRoot(1, rootTunnel, data);

        assertEq(gstS.balanceOf(alice), 1_000e18, "alice should have GST-S");
        assertEq(child.totalMinted(), 1_000e18, "totalMinted updated");
    }

    function test_processMessage_revertNotFxChild() public {
        bytes memory data = abi.encode(alice, uint256(1e18), bytes(""));

        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(ShibariumBridgeChild.NotFxChild.selector, address(0xBAD)));
        child.processMessageFromRoot(1, rootTunnel, data);
    }

    function test_processMessage_revertWrongRootTunnel() public {
        bytes memory data = abi.encode(alice, uint256(1e18), bytes(""));

        vm.prank(fxChild);
        vm.expectRevert(
            abi.encodeWithSelector(ShibariumBridgeChild.NotRootTunnel.selector, address(0xBAD))
        );
        child.processMessageFromRoot(1, address(0xBAD), data);
    }

    function test_processMessage_revertWhenPaused() public {
        vm.prank(owner_);
        child.setPaused(true);

        bytes memory data = abi.encode(alice, uint256(1e18), bytes(""));
        vm.prank(fxChild);
        vm.expectRevert(ShibariumBridgeChild.Halted.selector);
        child.processMessageFromRoot(1, rootTunnel, data);
    }

    // ── withdraw ─────────────────────────────────────────────────────────────

    function _mintGSTS(address to, uint256 amount) internal {
        bytes memory data = abi.encode(to, amount, bytes(""));
        vm.prank(fxChild);
        child.processMessageFromRoot(1, rootTunnel, data);
    }

    function test_withdraw_burnsAndEmits() public {
        _mintGSTS(alice, 5_000e18);

        vm.startPrank(alice);
        gstS.approve(address(child), 5_000e18);
        uint256 nonce = child.withdraw(5_000e18, l1Alice);
        vm.stopPrank();

        assertEq(nonce, 1, "nonce = 1");
        assertEq(gstS.balanceOf(alice), 0, "GST-S burned");
        assertEq(child.totalBurned(), 5_000e18, "totalBurned updated");
        assertEq(child.circulatingSupply(), 0, "circulating = 0");
    }

    function test_withdraw_revertZeroAmount() public {
        vm.startPrank(alice);
        vm.expectRevert(ShibariumBridgeChild.ZeroAmount.selector);
        child.withdraw(0, l1Alice);
        vm.stopPrank();
    }

    function test_withdraw_revertZeroL1Recipient() public {
        _mintGSTS(alice, 1e18);
        vm.startPrank(alice);
        gstS.approve(address(child), 1e18);
        vm.expectRevert(ShibariumBridgeChild.ZeroAddress.selector);
        child.withdraw(1e18, address(0));
        vm.stopPrank();
    }

    function test_withdraw_revertWhenPaused() public {
        _mintGSTS(alice, 1e18);

        vm.prank(owner_);
        child.setPaused(true);

        vm.startPrank(alice);
        gstS.approve(address(child), 1e18);
        vm.expectRevert(ShibariumBridgeChild.Halted.selector);
        child.withdraw(1e18, l1Alice);
        vm.stopPrank();
    }

    // ── incrementalWithdrawNonce ──────────────────────────────────────────────

    function test_withdrawalNonce_increments() public {
        _mintGSTS(alice, 3_000e18);

        vm.startPrank(alice);
        gstS.approve(address(child), 3_000e18);
        uint256 n1 = child.withdraw(1_000e18, l1Alice);
        uint256 n2 = child.withdraw(1_000e18, l1Alice);
        uint256 n3 = child.withdraw(1_000e18, l1Alice);
        vm.stopPrank();

        assertEq(n1, 1);
        assertEq(n2, 2);
        assertEq(n3, 3);
    }

    // ── ownership ────────────────────────────────────────────────────────────

    function test_setRootTunnel_byOwner() public {
        address newTunnel = address(0xBEEF1);
        vm.prank(owner_);
        child.setRootTunnel(newTunnel);
        assertEq(child.rootTunnel(), newTunnel);
    }

    function test_setRootTunnel_revertNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ShibariumBridgeChild.NotOwner.selector, alice));
        child.setRootTunnel(address(0xBEEF2));
    }

    function test_transferOwnership() public {
        vm.prank(owner_);
        child.transferOwnership(alice);
        assertEq(child.owner(), alice);
    }
}
