## Sūrya's Description Report

### Files Description Table


|  File Name  |  SHA-1 Hash  |
|-------------|--------------|
| src/bridge/BridgeMintableERC20.sol | 9b00ce6ee6c6d4423047b18c619fe51e3e4f2672 |
| src/bridge/StandardBridge.sol | 3911b8b8bc86684aa8f9b4d41a0243593b145557 |
| src/common/ERC20.sol | e0b1d2e33ed6c0d34cdcfcec3d075b82548f2614 |
| src/common/IXDomainMessenger.sol | 9ec8f1482ee527e79cf8df7391e61b060765290a |
| src/common/LibAddress.sol | 6e12b868be309508eb9b98ee26afac0f3b650ef9 |
| src/common/LibErrors.sol | 006ede683c4ae1d0e10acd11e907829ffe2f8b06 |
| src/common/Ownable.sol | 9c133070b57966a58507774981b0c5fc750e3405 |
| src/common/XDomainMessenger.sol | e4f8b7e8c194cff3723652bd408743a119825d56 |
| src/futuristic/FutureStack.sol | b1ef56f91df67b4c161e5a97c8a40c9724ce7187 |
| src/governance/Governor.sol | cced237c5afe7729c008d4b014dfc2d458217799 |
| src/governance/ProposalExecutor.sol | bdb23d386c9b895ea6c1cef56a070016e0cc60aa |
| src/l1/Admin.sol | 48379ec0615fb5416eadf95dafa6aa5b2e8e8573 |
| src/l1/ChainConfig.sol | e588cff94afe2a27d327bbcf69430c747b506485 |
| src/l1/DisputeGameFactory.sol | 11120020670001517be1c1ebf8a3366a834c1502 |
| src/l1/EmergencyShutdown.sol | ee9691a47f8ad3d59d855c239a23b81585d79f55 |
| src/l1/Faucet.sol | a18fd532286583e08cc092845bad4888b2902f99 |
| src/l1/FeeMarket.sol | 3073d85bcbb2a861f27a69c3b4cfe57678fb6127 |
| src/l1/GenesisConfig.sol | 802eeacf73ebf5172e1f2ea806fabb83161bfa6d |
| src/l1/L2OutputOracle.sol | 23ac8209db5426fbc249e0075ac95565a96f87a0 |
| src/l1/Messenger.sol | 2e2e9485c607d50912c3c632a515e0c837dafa81 |
| src/l1/NativeToken.sol | 61db5c470b29692e230351be67999a4851ce1344 |
| src/l1/PauseGuardian.sol | fdba51d39bf6f7275c7dc0518a9a851b90e56bda |
| src/l1/Portal.sol | 9fc0d07b918678546d10fa6fa011f645370d48df |
| src/l1/RewardDistributor.sol | 558c437a0b90938466cc0c6918c66f79c41d504d |
| src/l1/RollupManager.sol | ddfb09fbb11d3ac1ff5840e1521648ea4c3ef307 |
| src/l1/SimpleDisputeGame.sol | 8aeca304b3816e6ac747162cf8a8305763a2c13e |
| src/l1/SlashingManager.sol | e96f01bc1e9f42a2a0154bc24d806cf50a9ee439 |
| src/l1/StakingManager.sol | ae6d4a2109b1e896aa8620663ac1133496348785 |
| src/l1/SystemConfig.sol | 7e58e9bf7fa1a942a254db330483ad3bd4d4cbea |
| src/l1/Treasury.sol | 691c2a04634990acd9e32a942a5ea38fa0f0ef84 |
| src/l1/UpgradeManager.sol | c87e8ff137f4dbc3a9f66c43aad9947d32de1b91 |
| src/l1/ValidatorRegistry.sol | 25d70ca69cff007699757efe2a0cfb4154c8dc82 |
| src/l1custom/L1CrossDomainMessenger.sol | e347676c3d02a18c9494c348ba40641b0559599e |
| src/l1custom/L1DisputeGameFactory.sol | 47150fcbb04107838543c11409e7a6a23bc131ec |
| src/l1custom/L1OptimismPortal.sol | 5738b50d8851b32e3e52ba94f04239dff0191df4 |
| src/l1custom/L1OutputOracle.sol | d8d1254c5b8379a87fc7514f78b96ed4f1ce18c3 |
| src/l1custom/L1SystemConfig.sol | a10b068e7ecdab7732445adf687ab25468590b1b |
| src/l2/DisputeGameAddressBook.sol | 5267cf507ff31505fa6fc626933994cc92500457 |
| src/opstack/DummyL2OO.sol | a6b61d960fffd5cbc0ac9f8dfc272098185ea792 |
| src/opstack/GasToken.sol | 24b7443fe154eeb982f28b41cb257423cebe8b19 |
| src/opstack/GuardPolicyStub.sol | a0b8005174c3f98dfe14de0d3e5ecf4312af1e98 |
| src/opstack/L2OutputOracleStub.sol | ad66a77fb8aa30f7e56871facef8847d651766a2 |
| src/tokens/TestERC20.sol | b5137d08084cd6340794512c89a8dbe4152f40ed |


### Contracts Description Table


|  Contract  |         Type        |       Bases      |                  |                 |
|:----------:|:-------------------:|:----------------:|:----------------:|:---------------:|
|     └      |  **Function Name**  |  **Visibility**  |  **Mutability**  |  **Modifiers**  |
||||||
| **BridgeMintableERC20** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | mint | External ❗️ | 🛑  | onlyBridge |
| └ | burn | External ❗️ | 🛑  | onlyBridge |
| └ | transfer | External ❗️ | 🛑  |NO❗️ |
| └ | approve | External ❗️ | 🛑  |NO❗️ |
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
| └ | _transfer | Internal 🔒 | 🛑  | |
||||||
| **IERC20Like** | Interface |  |||
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
| └ | transfer | External ❗️ | 🛑  |NO❗️ |
||||||
| **IBridgeMintableERC20** | Interface |  |||
| └ | mint | External ❗️ | 🛑  |NO❗️ |
| └ | burn | External ❗️ | 🛑  |NO❗️ |
||||||
| **StandardBridge** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setRemoteBridge | External ❗️ | 🛑  | onlyOwner |
| └ | bridgeERC20 | External ❗️ | 🛑  |NO❗️ |
| └ | finalizeBridgeERC20 | External ❗️ | 🛑  | onlyRemoteBridge |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
||||||
| **ERC20** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | _transfer | Internal 🔒 | 🛑  | |
| └ | transfer | External ❗️ | 🛑  |NO❗️ |
| └ | approve | External ❗️ | 🛑  |NO❗️ |
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
| └ | _mint | Internal 🔒 | 🛑  | |
| └ | _burn | Internal 🔒 | 🛑  | |
||||||
| **IXDomainMessenger** | Interface |  |||
| └ | xDomainMessageSender | External ❗️ |   |NO❗️ |
| └ | sendMessage | External ❗️ |  💵 |NO❗️ |
| └ | relayMessage | External ❗️ | 🛑  |NO❗️ |
||||||
| **LibAddress** | Library |  |||
| └ | isContract | Internal 🔒 |   | |
||||||
| **LibErrors** | Library |  |||
||||||
| **Ownable** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | transferOwnership | External ❗️ | 🛑  | onlyOwner |
||||||
| **XDomainMessenger** | Implementation | IXDomainMessenger |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setParentMessenger | External ❗️ | 🛑  | onlyOwner |
| └ | setChildMessenger | External ❗️ | 🛑  | onlyOwner |
| └ | xDomainMessageSender | External ❗️ |   |NO❗️ |
| └ | sendMessage | External ❗️ |  💵 |NO❗️ |
| └ | relayMessage | External ❗️ | 🛑  | onlyParentMessenger |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
||||||
| **AccessManaged** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | hasRole | Public ❗️ |   |NO❗️ |
| └ | grantRole | External ❗️ | 🛑  | onlyAdmin |
| └ | revokeRole | External ❗️ | 🛑  | onlyAdmin |
| └ | transferAdmin | External ❗️ | 🛑  | onlyAdmin |
||||||
| **Pausable** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | pause | External ❗️ | 🛑  | onlyAdmin |
| └ | unpause | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ValidatorRegistryV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | registerValidator | External ❗️ | 🛑  | onlyAdmin |
| └ | removeValidator | External ❗️ | 🛑  | onlyAdmin |
| └ | setJailed | External ❗️ | 🛑  | onlyAdmin |
| └ | setCommission | External ❗️ | 🛑  | onlyAdmin |
| └ | validatorCount | External ❗️ |   |NO❗️ |
||||||
| **StakingManagerV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setSlashManager | External ❗️ | 🛑  | onlyAdmin |
| └ | delegateStake | External ❗️ |  💵 |NO❗️ |
| └ | withdrawStake | External ❗️ | 🛑  |NO❗️ |
| └ | requestUnbond | External ❗️ | 🛑  |NO❗️ |
| └ | claimUnbonded | External ❗️ | 🛑  |NO❗️ |
| └ | previewWithdraw | External ❗️ |   |NO❗️ |
| └ | slashStake | External ❗️ | 🛑  |NO❗️ |
| └ | _previewMintedShares | Internal 🔒 |   | |
| └ | setJail | External ❗️ | 🛑  |NO❗️ |
| └ | setParams | External ❗️ | 🛑  | onlyAdmin |
||||||
| **SlashingManagerV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | slash | External ❗️ | 🛑  | onlyAdmin |
| └ | slashWithType | External ❗️ | 🛑  | onlyAdmin |
| └ | slashDowntime | External ❗️ | 🛑  | onlyAdmin |
| └ | setParams | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ITreasuryV2** | Interface |  |||
| └ | withdraw | External ❗️ | 🛑  |NO❗️ |
||||||
| **RewardDistributorV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | depositReward | External ❗️ |  💵 |NO❗️ |
| └ | pullFromTreasury | External ❗️ | 🛑  | onlyAdmin |
| └ | claim | External ❗️ | 🛑  |NO❗️ |
||||||
| **EpochManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | advance | External ❗️ | 🛑  | onlyAdmin |
| └ | setParams | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ConsensusParams** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setUint | External ❗️ | 🛑  | onlyAdmin |
| └ | setBytes | External ❗️ | 🛑  | onlyAdmin |
||||||
| **GenesisConfigV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | updateConfig | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ChainConfigV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setConfig | External ❗️ | 🛑  | onlyAdmin |
||||||
| **UpgradeManagerV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | schedule | External ❗️ | 🛑  | onlyAdmin |
| └ | markExecuted | External ❗️ | 🛑  | onlyAdmin |
||||||
| **PauseGuardianV2** | Implementation | Pausable |||
| └ | <Constructor> | Public ❗️ | 🛑  | Pausable |
| └ | guardedCall | External ❗️ | 🛑  | onlyAdmin whenNotPaused |
||||||
| **IMintableToken** | Interface |  |||
| └ | mint | External ❗️ | 🛑  |NO❗️ |
||||||
| **IBurnableToken** | Interface |  |||
| └ | burn | External ❗️ | 🛑  |NO❗️ |
||||||
| **NativeTokenV2** | Implementation | AccessManaged, ERC20 |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged ERC20 |
| └ | mint | External ❗️ | 🛑  | onlyAdmin |
| └ | burn | External ❗️ | 🛑  | onlyAdmin |
||||||
| **WrappedNative** | Implementation | ERC20 |||
| └ | <Constructor> | Public ❗️ | 🛑  | ERC20 |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
| └ | deposit | External ❗️ |  💵 |NO❗️ |
| └ | withdraw | External ❗️ | 🛑  |NO❗️ |
||||||
| **MintController** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setMinter | External ❗️ | 🛑  | onlyAdmin |
| └ | controlledMint | External ❗️ | 🛑  |NO❗️ |
||||||
| **BurnController** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setBurner | External ❗️ | 🛑  | onlyAdmin |
| └ | controlledBurn | External ❗️ | 🛑  |NO❗️ |
||||||
| **FeeMarketV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setPriorityFee | External ❗️ | 🛑  | onlyAdmin |
| └ | updateBaseFee | External ❗️ | 🛑  | onlyAdmin |
| └ | quote | External ❗️ |   |NO❗️ |
||||||
| **BaseFeeOracle** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | pushBaseFee | External ❗️ | 🛑  | onlyAdmin |
||||||
| **IERC20Minimal** | Interface |  |||
| └ | transfer | External ❗️ | 🛑  |NO❗️ |
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
||||||
| **TreasuryV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
| └ | withdraw | Public ❗️ | 🛑  | onlyAdmin |
| └ | withdrawToken | External ❗️ | 🛑  | onlyAdmin |
||||||
| **EmissionController** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setEmissionRate | External ❗️ | 🛑  | onlyAdmin |
||||||
| **Stablecoin** | Implementation | AccessManaged, ERC20 |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged ERC20 |
| └ | setMinter | External ❗️ | 🛑  | onlyAdmin |
| └ | setBurner | External ❗️ | 🛑  | onlyAdmin |
| └ | mint | External ❗️ | 🛑  |NO❗️ |
| └ | burn | External ❗️ | 🛑  |NO❗️ |
| └ | burnSelf | External ❗️ | 🛑  |NO❗️ |
||||||
| **CollateralVault** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setController | External ❗️ | 🛑  | onlyAdmin |
| └ | setCollateralAsset | External ❗️ | 🛑  | onlyAdmin |
| └ | deposit | External ❗️ | 🛑  |NO❗️ |
| └ | withdraw | External ❗️ | 🛑  |NO❗️ |
| └ | consume | External ❗️ | 🛑  | onlyController |
| └ | moveCollateral | External ❗️ | 🛑  | onlyController |
| └ | _withdraw | Internal 🔒 | 🛑  | |
||||||
| **PriceOracleRouter** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setPrice | External ❗️ | 🛑  | onlyAdmin |
||||||
| **PegStabilityModule** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setFee | External ❗️ | 🛑  | onlyAdmin |
| └ | swapCollateralForStable | External ❗️ | 🛑  |NO❗️ |
| └ | swapStableForCollateral | External ❗️ | 🛑  |NO❗️ |
||||||
| **AIMonetaryPolicy** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | pushSignal | External ❗️ | 🛑  | onlyAdmin |
||||||
| **VolatilityController** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setBound | External ❗️ | 🛑  | onlyAdmin |
||||||
| **CircuitBreaker** | Implementation | Pausable |||
| └ | <Constructor> | Public ❗️ | 🛑  | Pausable |
| └ | trip | External ❗️ | 🛑  | onlyAdmin |
||||||
| **StablecoinController** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setMinCollateralRatio | External ❗️ | 🛑  | onlyAdmin |
| └ | mintAgainstCollateral | External ❗️ | 🛑  |NO❗️ |
| └ | repay | External ❗️ | 🛑  |NO❗️ |
||||||
| **CrossChainMessenger** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | sendMessage | External ❗️ | 🛑  | onlyAdmin |
| └ | relayMessage | External ❗️ | 🛑  | onlyAdmin |
||||||
| **StateCommitmentChain** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | appendState | External ❗️ | 🛑  | onlyAdmin |
||||||
| **BridgeRouter** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | registerBridge | External ❗️ | 🛑  | onlyAdmin |
||||||
| **IERC721Minimal** | Interface |  |||
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
||||||
| **TokenBridge** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | deposit | External ❗️ | 🛑  |NO❗️ |
| └ | finalizeWithdrawal | External ❗️ | 🛑  | onlyAdmin |
||||||
| **NFTBridge** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | deposit | External ❗️ | 🛑  |NO❗️ |
| └ | finalizeWithdrawal | External ❗️ | 🛑  | onlyAdmin |
||||||
| **MerkleProofVerifier** | Implementation |  |||
| └ | verify | External ❗️ |   |NO❗️ |
||||||
| **ZKProofVerifier** | Implementation |  |||
| └ | verify | External ❗️ | 🛑  |NO❗️ |
||||||
| **FraudProofVerifier** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | submitProof | External ❗️ | 🛑  |NO❗️ |
| └ | resolve | External ❗️ | 🛑  | onlyAdmin |
||||||
| **CheckpointManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | submitCheckpoint | External ❗️ | 🛑  | onlyAdmin |
||||||
| **RollupManagerV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | registerRollup | External ❗️ | 🛑  | onlyAdmin |
| └ | setLive | External ❗️ | 🛑  | onlyAdmin |
||||||
| **BatchInbox** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | appendBatch | External ❗️ | 🛑  | onlyAdmin |
||||||
| **SequencerRegistry** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | addSequencer | External ❗️ | 🛑  | onlyAdmin |
| └ | removeSequencer | External ❗️ | 🛑  | onlyAdmin |
||||||
| **BatcherBondManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | postBond | External ❗️ |  💵 |NO❗️ |
| └ | slash | External ❗️ | 🛑  | onlyAdmin |
||||||
| **DisputeGameFactoryV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | createGame | External ❗️ | 🛑  | onlyAdmin |
||||||
| **FaultDisputeGame** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | initiate | Public ❗️ | 🛑  |NO❗️ |
| └ | resolve | External ❗️ | 🛑  | onlyAdmin |
||||||
| **OutputOracle** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | proposeOutput | External ❗️ | 🛑  | onlyAdmin |
||||||
| **FinalizationManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | finalize | External ❗️ | 🛑  | onlyAdmin |
| └ | _finalize | Internal 🔒 | 🛑  | |
| └ | finalizeWithDispute | External ❗️ | 🛑  | onlyAdmin |
| └ | challenge | External ❗️ | 🛑  |NO❗️ |
| └ | _requireFinalizable | Internal 🔒 |   | |
||||||
| **GovernanceToken** | Implementation | AccessManaged, ERC20 |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged ERC20 |
| └ | mint | External ❗️ | 🛑  | onlyAdmin |
| └ | burn | External ❗️ | 🛑  | onlyAdmin |
||||||
| **VotingEscrow** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | lock | External ❗️ | 🛑  |NO❗️ |
| └ | unlock | External ❗️ | 🛑  |NO❗️ |
| └ | votingPower | Public ❗️ |   |NO❗️ |
||||||
| **GovernorV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | propose | External ❗️ | 🛑  |NO❗️ |
| └ | castVote | External ❗️ | 🛑  |NO❗️ |
| └ | queue | External ❗️ | 🛑  | onlyAdmin |
| └ | execute | External ❗️ | 🛑  | onlyAdmin |
| └ | state | Public ❗️ |   |NO❗️ |
||||||
| **ProposalExecutorV2** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | schedule | External ❗️ | 🛑  | onlyAdmin |
| └ | execute | External ❗️ | 🛑  | onlyAdmin |
||||||
| **DelegationManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | delegate | External ❗️ | 🛑  |NO❗️ |
||||||
| **QuadraticVoting** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | castVote | External ❗️ | 🛑  |NO❗️ |
| └ | sqrt | Internal 🔒 |   | |
||||||
| **AIGovernanceAdvisor** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | pushRecommendation | External ❗️ | 🛑  | onlyAdmin |
||||||
| **DecentralizedID** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | issue | External ❗️ | 🛑  | onlyAdmin |
| └ | revoke | External ❗️ | 🛑  | onlyAdmin |
||||||
| **IdentityRegistry** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setStatus | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ReputationScore** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | adjust | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ZKIdentityVerifier** | Implementation |  |||
| └ | verify | External ❗️ | 🛑  |NO❗️ |
||||||
| **SelectiveDisclosure** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | shareClaim | External ❗️ | 🛑  |NO❗️ |
||||||
| **ComplianceGate** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setAllowed | External ❗️ | 🛑  | onlyAdmin |
| └ | check | External ❗️ |   |NO❗️ |
||||||
| **AISecurityOracle** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | publishScore | External ❗️ | 🛑  | onlyAdmin |
||||||
| **AnomalyDetector** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | flag | External ❗️ | 🛑  | onlyAdmin |
||||||
| **TransactionClassifier** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | classify | External ❗️ | 🛑  | onlyAdmin |
||||||
| **KeeperRegistry** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | addKeeper | External ❗️ | 🛑  | onlyAdmin |
| └ | removeKeeper | External ❗️ | 🛑  | onlyAdmin |
||||||
| **AutonomousExecutor** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | schedule | External ❗️ | 🛑  | onlyAdmin |
| └ | execute | External ❗️ | 🛑  | onlyAdmin |
||||||
| **PredictiveGasManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | publishForecast | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ContractRegistry** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | register | External ❗️ | 🛑  | onlyAdmin |
||||||
| **AddressBook** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setAddress | External ❗️ | 🛑  | onlyAdmin |
||||||
| **UpgradeableProxy** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | upgradeTo | External ❗️ | 🛑  | onlyAdmin |
| └ | <Fallback> | External ❗️ |  💵 |NO❗️ |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
||||||
| **Multicall** | Implementation |  |||
| └ | multicall | External ❗️ | 🛑  |NO❗️ |
||||||
| **MetaTxForwarder** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | execute | External ❗️ | 🛑  | onlyAdmin |
||||||
| **AccountAbstraction** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | handleOp | External ❗️ | 🛑  | onlyAdmin |
||||||
| **NFTCore** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | mint | External ❗️ | 🛑  | onlyAdmin |
| └ | burn | External ❗️ | 🛑  | onlyAdmin |
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
||||||
| **RoyaltyManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setRoyalty | External ❗️ | 🛑  | onlyAdmin |
||||||
| **SoulboundToken** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | mint | External ❗️ | 🛑  | onlyAdmin |
| └ | burn | External ❗️ | 🛑  | onlyAdmin |
||||||
| **DEXRouter** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | swap | External ❗️ | 🛑  |NO❗️ |
||||||
| **LiquidityPool** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | addLiquidity | External ❗️ | 🛑  |NO❗️ |
| └ | removeLiquidity | External ❗️ | 🛑  |NO❗️ |
||||||
| **YieldVault** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | deposit | External ❗️ | 🛑  |NO❗️ |
| └ | withdraw | External ❗️ | 🛑  |NO❗️ |
||||||
| **InsuranceFund** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
| └ | payout | External ❗️ | 🛑  | onlyAdmin |
||||||
| **EmergencyShutdownV2** | Implementation | Pausable |||
| └ | <Constructor> | Public ❗️ | 🛑  | Pausable |
| └ | shutdown | External ❗️ | 🛑  | onlyAdmin |
||||||
| **ValidatorRecovery** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | setRecovery | External ❗️ | 🛑  | onlyAdmin |
||||||
| **TreasuryBackstop** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | backstop | External ❗️ |  💵 | onlyAdmin |
||||||
| **ForkRecoveryManager** | Implementation | AccessManaged |||
| └ | <Constructor> | Public ❗️ | 🛑  | AccessManaged |
| └ | selectFork | External ❗️ | 🛑  | onlyAdmin |
||||||
| **Governor** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setVotingPeriod | External ❗️ | 🛑  | onlyOwner |
| └ | propose | External ❗️ | 🛑  |NO❗️ |
| └ | vote | External ❗️ | 🛑  |NO❗️ |
| └ | queue | External ❗️ | 🛑  | onlyOwner |
| └ | execute | External ❗️ | 🛑  | onlyOwner |
| └ | proposalsLength | External ❗️ |   |NO❗️ |
||||||
| **ProposalExecutor** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setGovernor | External ❗️ | 🛑  |NO❗️ |
| └ | queueTx | External ❗️ | 🛑  | onlyGovernor |
| └ | execute | External ❗️ | 🛑  | onlyGovernor |
| └ | queueLength | External ❗️ |   |NO❗️ |
||||||
| **Admin** | Implementation | Ownable |||
| └ | addAdmin | External ❗️ | 🛑  | onlyOwner |
| └ | removeAdmin | External ❗️ | 🛑  | onlyOwner |
||||||
| **ChainConfig** | Implementation | Ownable |||
| └ | setConfig | External ❗️ | 🛑  | onlyOwner |
| └ | getConfig | External ❗️ |   |NO❗️ |
||||||
| **IDisputeGame** | Interface |  |||
| └ | gameType | External ❗️ |   |NO❗️ |
| └ | createdAt | External ❗️ |   |NO❗️ |
| └ | status | External ❗️ |   |NO❗️ |
||||||
| **IGameClone** | Interface |  |||
| └ | initialize | External ❗️ | 🛑  |NO❗️ |
||||||
| **DisputeGameFactory** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | version | External ❗️ |   |NO❗️ |
| └ | transferOwnership | External ❗️ | 🛑  | onlyOwner |
| └ | setImplementation | External ❗️ | 🛑  | onlyOwner |
| └ | computeGameId | Public ❗️ |   |NO❗️ |
| └ | create | External ❗️ | 🛑  |NO❗️ |
| └ | allGamesLength | External ❗️ |   |NO❗️ |
| └ | _clone | Internal 🔒 | 🛑  | |
||||||
| **EmergencyShutdown** | Implementation | Ownable |||
| └ | trigger | External ❗️ | 🛑  | onlyOwner |
| └ | clear | External ❗️ | 🛑  | onlyOwner |
||||||
| **Faucet** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ |  💵 |NO❗️ |
| └ | setConfig | External ❗️ | 🛑  | onlyOwner |
| └ | fund | External ❗️ |  💵 |NO❗️ |
| └ | drip | External ❗️ | 🛑  |NO❗️ |
||||||
| **FeeMarket** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setFeeParams | External ❗️ | 🛑  | onlyOwner |
||||||
| **GenesisConfig** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
||||||
| **L2OutputOracle** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setProposer | External ❗️ | 🛑  | onlyOwner |
| └ | proposeOutput | External ❗️ | 🛑  |NO❗️ |
| └ | getOutput | External ❗️ |   |NO❗️ |
| └ | outputsLength | External ❗️ |   |NO❗️ |
||||||
| **Messenger** | Implementation | Ownable |||
| └ | sendMessage | External ❗️ |  💵 |NO❗️ |
| └ | relayMessage | External ❗️ | 🛑  | onlyOwner |
| └ | sentCount | External ❗️ |   |NO❗️ |
| └ | relayedCount | External ❗️ |   |NO❗️ |
||||||
| **NativeToken** | Implementation | ERC20, Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  | ERC20 |
| └ | mint | External ❗️ | 🛑  | onlyOwner |
| └ | burn | External ❗️ | 🛑  | onlyOwner |
||||||
| **PauseGuardian** | Implementation | Ownable |||
| └ | setPaused | External ❗️ | 🛑  | onlyOwner |
||||||
| **Portal** | Implementation | Ownable |||
| └ | depositETH | External ❗️ |  💵 |NO❗️ |
| └ | sendMessage | External ❗️ |  💵 |NO❗️ |
||||||
| **RewardDistributor** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setStakingManager | External ❗️ | 🛑  | onlyOwner |
| └ | distribute | External ❗️ | 🛑  | onlyOwner |
||||||
| **RollupManager** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setAddresses | External ❗️ | 🛑  | onlyOwner |
||||||
| **SimpleDisputeGame** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | version | External ❗️ |   |NO❗️ |
| └ | gameType | External ❗️ |   |NO❗️ |
| └ | initialize | External ❗️ | 🛑  |NO❗️ |
| └ | dispute | External ❗️ | 🛑  |NO❗️ |
| └ | resolveChallengerWins | External ❗️ | 🛑  |NO❗️ |
| └ | resolveDefenderWins | External ❗️ | 🛑  |NO❗️ |
||||||
| **SlashingManager** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setStakingManager | External ❗️ | 🛑  | onlyOwner |
| └ | slash | External ❗️ | 🛑  | onlyOwner |
||||||
| **StakingManager** | Implementation | Ownable |||
| └ | stake | External ❗️ |  💵 |NO❗️ |
| └ | unstake | External ❗️ | 🛑  |NO❗️ |
| └ | slash | External ❗️ | 🛑  | onlyOwner |
||||||
| **SystemConfig** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setBatcher | External ❗️ | 🛑  | onlyOwner |
| └ | setUnsafeBlockSigner | External ❗️ | 🛑  | onlyOwner |
| └ | setGasConfig | External ❗️ | 🛑  | onlyOwner |
||||||
| **Treasury** | Implementation | Ownable |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | <Receive Ether> | External ❗️ |  💵 |NO❗️ |
| └ | withdrawETH | External ❗️ | 🛑  | onlyOwner |
| └ | withdrawNative | External ❗️ | 🛑  | onlyOwner |
||||||
| **UpgradeManager** | Implementation | Ownable |||
| └ | propose | External ❗️ | 🛑  | onlyOwner |
| └ | execute | External ❗️ | 🛑  | onlyOwner |
| └ | proposalsLength | External ❗️ |   |NO❗️ |
||||||
| **ValidatorRegistry** | Implementation | Ownable |||
| └ | addValidator | External ❗️ | 🛑  | onlyOwner |
| └ | removeValidator | External ❗️ | 🛑  | onlyOwner |
| └ | validatorCount | External ❗️ |   |NO❗️ |
||||||
| **L1CrossDomainMessenger** | Implementation | XDomainMessenger |||
| └ | <Constructor> | Public ❗️ | 🛑  | XDomainMessenger |
| └ | version | External ❗️ |   |NO❗️ |
||||||
| **L1DisputeGameFactory** | Implementation |  |||
| └ | version | External ❗️ |   |NO❗️ |
||||||
| **L1OptimismPortal** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | pause | External ❗️ | 🛑  | onlyOwner |
| └ | unpause | External ❗️ | 🛑  | onlyOwner |
| └ | depositTransaction | External ❗️ |  💵 | whenNotPaused |
| └ | version | External ❗️ |   |NO❗️ |
||||||
| **L1OutputOracle** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setProposer | External ❗️ | 🛑  | onlyOwner |
| └ | proposeOutput | External ❗️ | 🛑  | onlyProposer |
| └ | version | External ❗️ |   |NO❗️ |
||||||
| **L1SystemConfig** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | setBatcher | External ❗️ | 🛑  | onlyOwner |
| └ | setUnsafeBlockSigner | External ❗️ | 🛑  | onlyOwner |
| └ | setGasConfig | External ❗️ | 🛑  | onlyOwner |
||||||
| **DisputeGameAddressBook** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | version | External ❗️ |   |NO❗️ |
| └ | setFactory | External ❗️ | 🛑  | onlyAdmin |
| └ | setAdmin | External ❗️ | 🛑  | onlyAdmin |
||||||
| **DummyL2OO** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | version | External ❗️ |   |NO❗️ |
| └ | nextOutputIndex | External ❗️ |   |NO❗️ |
| └ | latestBlockNumber | External ❗️ |   |NO❗️ |
| └ | initialize | External ❗️ | 🛑  |NO❗️ |
| └ | proposeL2Output | External ❗️ | 🛑  |NO❗️ |
||||||
| **GasToken** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | approve | External ❗️ | 🛑  |NO❗️ |
| └ | transfer | External ❗️ | 🛑  |NO❗️ |
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
| └ | _transfer | Internal 🔒 | 🛑  | |
| └ | _mint | Internal 🔒 | 🛑  | |
||||||
| **GuardPolicyStub** | Implementation |  |||
| └ | mode | External ❗️ |   |NO❗️ |
| └ | setMode | External ❗️ | 🛑  |NO❗️ |
| └ | delaySeconds | External ❗️ |   |NO❗️ |
| └ | setDelaySeconds | External ❗️ | 🛑  |NO❗️ |
| └ | riskThreshold | External ❗️ |   |NO❗️ |
| └ | setRiskThreshold | External ❗️ | 🛑  |NO❗️ |
| └ | riskScore | External ❗️ |   |NO❗️ |
| └ | setRiskScore | External ❗️ | 🛑  |NO❗️ |
||||||
| **L2OutputOracle** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | version | External ❗️ |   |NO❗️ |
| └ | submissionInterval | External ❗️ |   |NO❗️ |
| └ | l2BlockTime | External ❗️ |   |NO❗️ |
| └ | startingBlockNumber | External ❗️ |   |NO❗️ |
| └ | startingTimestamp | External ❗️ |   |NO❗️ |
| └ | finalizationPeriodSeconds | External ❗️ |   |NO❗️ |
| └ | proposer | External ❗️ |   |NO❗️ |
| └ | challenger | External ❗️ |   |NO❗️ |
| └ | nextBlockNumber | External ❗️ |   |NO❗️ |
| └ | computeL2Timestamp | External ❗️ |   |NO❗️ |
| └ | proposeL2Output | External ❗️ | 🛑  |NO❗️ |
||||||
| **TestERC20** | Implementation |  |||
| └ | <Constructor> | Public ❗️ | 🛑  |NO❗️ |
| └ | mint | External ❗️ | 🛑  | onlyOwner |
| └ | transfer | External ❗️ | 🛑  |NO❗️ |
| └ | approve | External ❗️ | 🛑  |NO❗️ |
| └ | transferFrom | External ❗️ | 🛑  |NO❗️ |
| └ | _transfer | Internal 🔒 | 🛑  | |


### Legend

|  Symbol  |  Meaning  |
|:--------:|-----------|
|    🛑    | Function can modify state |
|    💵    | Function is payable |
