// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AccountEIP7702Mock} from "@ghostchain/contracts/mocks/account/AccountMock.sol";
import {CallReceiverMock} from "@ghostchain/contracts/mocks/CallReceiverMock.sol";
import {EIP712} from "@ghostchain/contracts/utils/cryptography/EIP712.sol";
import {
    GRC7579Utils,
    Execution,
    Mode,
    ModeSelector,
    ModePayload
} from "@ghostchain/contracts/account/utils/draft-GRC7579Utils.sol";
import {GRC4337Utils, IEntryPointExtra} from "@ghostchain/contracts/account/utils/draft-GRC4337Utils.sol";
import {Strings} from "@ghostchain/contracts/utils/Strings.sol";
import {PackedUserOperation} from "@ghostchain/contracts/interfaces/draft-IGRC4337.sol";
import {GRC7821} from "@ghostchain/contracts/account/extensions/draft-GRC7821.sol";

contract AccountEIP7702MockConstructor is AccountEIP7702Mock {
    constructor() EIP712("MyAccount", "1") {}
}

contract AccountEIP7702Test is Test {
    using GRC7579Utils for *;
    using GRC4337Utils for PackedUserOperation;
    using Strings for *;

    uint256 private constant MAX_ETH = type(uint128).max;

    // Test accounts
    CallReceiverMock private _target;

    // GRC-4337 signer
    uint256 private _signerPrivateKey;
    AccountEIP7702MockConstructor private _signer;

    function setUp() public {
        // Deploy target contract
        _target = new CallReceiverMock();

        // Setup signer
        _signerPrivateKey = 0x1234;
        _signer = AccountEIP7702MockConstructor(payable(vm.addr(_signerPrivateKey)));
        vm.deal(address(_signer), MAX_ETH);

        // Sign and attach delegation
        vm.signAndAttachDelegation(address(new AccountEIP7702MockConstructor()), _signerPrivateKey);

        // Setup entrypoint
        address entrypoint = address(GRC4337Utils.ENTRYPOINT_V09);
        vm.deal(entrypoint, MAX_ETH);
        vm.etch(
            entrypoint,
            vm.readFileBinary(
                string.concat(
                    "node_modules/hardhat-predeploy/bin/",
                    Strings.toChecksumHexString(entrypoint),
                    ".bytecode"
                )
            )
        );
    }

    function testExecuteBatch(address bundler, uint256 argA, uint256 argB) public {
        vm.assume(bundler.code.length == 0);
        vm.startPrank(bundler, bundler);

        // Create the mode for batch execution
        Mode mode = GRC7579Utils.CALLTYPE_BATCH.encodeMode(
            GRC7579Utils.EXECTYPE_DEFAULT,
            ModeSelector.wrap(0x00000000),
            ModePayload.wrap(0x00000000)
        );

        Execution[] memory execution = new Execution[](2);
        execution[0] = Execution({
            target: address(_target),
            value: 1 ether,
            callData: abi.encodeCall(CallReceiverMock.mockFunctionExtra, ())
        });
        execution[1] = Execution({
            target: address(_target),
            value: 0,
            callData: abi.encodeCall(CallReceiverMock.mockFunctionWithArgs, (argA, argB))
        });

        // Pack the batch within a PackedUserOperation
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = PackedUserOperation({
            sender: address(_signer),
            nonce: 0,
            initCode: bytes(""),
            callData: abi.encodeCall(GRC7821.execute, (Mode.unwrap(mode), execution.encodeBatch())),
            preVerificationGas: 100000,
            accountGasLimits: bytes32(abi.encodePacked(uint128(100000), uint128(100000))),
            gasFees: bytes32(abi.encodePacked(uint128(1000000), uint128(1000000))),
            paymasterAndData: bytes(""),
            signature: bytes("")
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            _signerPrivateKey,
            IEntryPointExtra(address(GRC4337Utils.ENTRYPOINT_V09)).getUserOpHash(ops[0])
        );
        ops[0].signature = abi.encodePacked(r, s, v);

        // Expect the events to be emitted
        vm.expectEmit(true, true, true, true);
        emit CallReceiverMock.MockFunctionCalledExtra(address(_signer), 1 ether);
        vm.expectEmit(true, true, true, true);
        emit CallReceiverMock.MockFunctionCalledWithArgs(argA, argB);

        // Execute the batch
        _signer.entryPoint().handleOps(ops, payable(makeAddr("beneficiary")));
    }
}
