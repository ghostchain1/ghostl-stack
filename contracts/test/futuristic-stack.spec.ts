import { expect } from "chai";
import { ghost } from "hardhat";

describe("Futuristic stack primitives", () => {
  it("handles stake delegation, slashing, rewards, and withdrawals", async () => {
    const [admin, alice, bob] = await ghost.getSigners();
    const Treasury = await ghost.getContractFactory("TreasuryV2");
    const treasury = await Treasury.connect(admin).deploy(admin.address);
    await treasury.waitForDeployment();

    const Staking = await ghost.getContractFactory("StakingManagerV2");
    const staking = await Staking.connect(admin).deploy(admin.address, await treasury.getAddress());
    await staking.waitForDeployment();

    const Slashing = await ghost.getContractFactory("SlashingManagerV2");
    const slashing = await Slashing.connect(admin).deploy(admin.address, await staking.getAddress());
    await slashing.waitForDeployment();
    await (await staking.connect(admin).setSlashManager(await slashing.getAddress())).wait();

    const Rewards = await ghost.getContractFactory("RewardDistributorV2");
    const rewards = await Rewards.connect(admin).deploy(admin.address, await treasury.getAddress());
    await rewards.waitForDeployment();

    const stakeAmount = ghost.parseEther("10");
    await staking.connect(alice).delegateStake(admin.address, { value: stakeAmount });
    const pool = await staking.pools(admin.address);
    expect(pool.totalStake).to.equal(stakeAmount);

    // Slash 2 GST to treasury
    await expect(slashing.connect(admin).slash(admin.address, ghost.parseEther("2"), "downtime")).to.emit(
      slashing,
      "Slashed"
    );
    const poolAfterSlash = await staking.pools(admin.address);
    expect(poolAfterSlash.totalStake).to.equal(ghost.parseEther("8"));
    const treasuryAfterSlash = await ghost.provider.getBalance(await treasury.getAddress());
    expect(treasuryAfterSlash).to.equal(ghost.parseEther("2"));

    const beforeWithdraw = treasuryAfterSlash;
    const withdrawable = await staking.previewWithdraw(admin.address, await staking.shares(admin.address, alice.address));
    await expect(staking.connect(alice).withdrawStake(admin.address, await staking.shares(admin.address, alice.address), alice.address)).to.emit(
      staking,
      "StakeWithdrawn"
    );
    const afterWithdraw = await ghost.provider.getBalance(await treasury.getAddress());
    expect(afterWithdraw).to.equal(beforeWithdraw);
    expect(withdrawable).to.equal(ghost.parseEther("8"));

    // Push rewards and claim
    await rewards.connect(admin).depositReward(admin.address, { value: ghost.parseEther("1") });
    await expect(rewards.connect(alice).claim(admin.address, alice.address)).to.emit(rewards, "RewardClaimed");
  });

  it("mints and repays stablecoin against collateral with oracle pricing", async () => {
    const [admin, user] = await ghost.getSigners();
    const Stable = await ghost.getContractFactory("Stablecoin");
    const stable = await Stable.connect(admin).deploy(admin.address);
    await stable.waitForDeployment();

    const Native = await ghost.getContractFactory("NativeTokenV2");
    const native = await Native.connect(admin).deploy(admin.address);
    await native.waitForDeployment();

    const Vault = await ghost.getContractFactory("CollateralVault");
    const vault = await Vault.connect(admin).deploy(admin.address);
    await vault.waitForDeployment();
    await (await vault.connect(admin).setCollateralAsset(await native.getAddress(), true)).wait();

    const Oracle = await ghost.getContractFactory("PriceOracleRouter");
    const oracle = await Oracle.connect(admin).deploy(admin.address);
    await oracle.waitForDeployment();
    const assetId = ghost.keccak256(ghost.solidityPacked(["address"], [await native.getAddress()]));
    await (await oracle.connect(admin).setPrice(assetId, ghost.parseUnits("1", 18))).wait();

    const Controller = await ghost.getContractFactory("StablecoinController");
    const controller = await Controller.connect(admin).deploy(
      admin.address,
      await stable.getAddress(),
      await vault.getAddress(),
      await oracle.getAddress(),
      15_000 // 150%
    );
    await controller.waitForDeployment();
    await (await vault.connect(admin).setController(await controller.getAddress())).wait();
    await (await stable.connect(admin).setMinter(await controller.getAddress(), true)).wait();
    await (await stable.connect(admin).setBurner(await controller.getAddress(), true)).wait();

    // Fund user with collateral
    await (await native.connect(admin).mint(user.address, ghost.parseEther("200"))).wait();
    await (await native.connect(user).approve(await vault.getAddress(), ghost.parseEther("200"))).wait();
    await (await vault.connect(user).deposit(await native.getAddress(), ghost.parseEther("200"))).wait();

    await expect(
      controller.connect(user).mintAgainstCollateral(await native.getAddress(), ghost.parseEther("150"), ghost.parseEther("100"))
    ).to.emit(controller, "Minted");
    expect(await stable.balanceOf(user.address)).to.equal(ghost.parseEther("100"));

    await (await stable.connect(user).approve(await controller.getAddress(), ghost.parseEther("100"))).wait();
    await expect(
      controller.connect(user).repay(await native.getAddress(), ghost.parseEther("100"), ghost.parseEther("150"))
    ).to.emit(controller, "Repaid");
    expect(await stable.balanceOf(user.address)).to.equal(0n);
  });

  it("bridges ERC20 with locking and release, and finalizes rollup outputs after clean disputes", async () => {
    const [admin, user, relayer] = await ghost.getSigners();
    const Token = await ghost.getContractFactory("NativeTokenV2");
    const token = await Token.connect(admin).deploy(admin.address);
    await token.waitForDeployment();
    await (await token.connect(admin).mint(user.address, ghost.parseEther("50"))).wait();

    const Bridge = await ghost.getContractFactory("TokenBridge");
    const bridge = await Bridge.connect(admin).deploy(admin.address);
    await bridge.waitForDeployment();

    await (await token.connect(user).approve(await bridge.getAddress(), ghost.parseEther("10"))).wait();
    await expect(bridge.connect(user).deposit(await token.getAddress(), user.address, ghost.parseEther("10"), 902)).to.emit(
      bridge,
      "DepositInitiated"
    );
    expect(await token.balanceOf(await bridge.getAddress())).to.equal(ghost.parseEther("10"));

    const messageId = ghost.id("msg-1");
    await expect(
      bridge.connect(admin).finalizeWithdrawal(messageId, await token.getAddress(), relayer.address, ghost.parseEther("10"), 901)
    ).to.emit(bridge, "WithdrawalFinalized");
    expect(await token.balanceOf(relayer.address)).to.equal(ghost.parseEther("10"));

    // Dispute/finalization
    const Disputes = await ghost.getContractFactory("DisputeGameFactoryV2");
    const disputes = await Disputes.connect(admin).deploy(admin.address);
    await disputes.waitForDeployment();
    const OutputOracle = await ghost.getContractFactory("OutputOracle");
    const oracle = await OutputOracle.connect(admin).deploy(admin.address);
    await oracle.waitForDeployment();
    const Finalization = await ghost.getContractFactory("FinalizationManager");
    const finalization = await Finalization.connect(admin).deploy(
      admin.address,
      await disputes.getAddress(),
      await oracle.getAddress(),
      0
    );
    await finalization.waitForDeployment();

    const disputeId = await disputes.connect(admin).createGame.staticCall(relayer.address, ghost.ZeroHash);
    await (await disputes.connect(admin).createGame(relayer.address, ghost.ZeroHash)).wait();
    const gameAddr = await disputes.games(disputeId);
    const game = await ghost.getContractAt("FaultDisputeGame", gameAddr);
    await (await game.connect(admin).resolve(false)).wait();
    await expect(finalization.connect(admin).finalizeWithDispute(1, ghost.ZeroHash, disputeId)).to.emit(
      finalization,
      "BlockFinalized"
    );
  });

  it("walks governance lifecycle with quorum and timelock", async () => {
    const [admin, voter] = await ghost.getSigners();
    const Token = await ghost.getContractFactory("GovernanceToken");
    const token = await Token.connect(admin).deploy(admin.address);
    await token.waitForDeployment();
    await (await token.connect(admin).mint(voter.address, ghost.parseEther("1000"))).wait();

    const Escrow = await ghost.getContractFactory("VotingEscrow");
    const escrow = await Escrow.connect(admin).deploy(admin.address);
    await escrow.waitForDeployment();
    await (await escrow.connect(voter).lock(ghost.parseEther("1000"), Math.floor(Date.now() / 1000) + 86400)).wait();

    const Executor = await ghost.getContractFactory("ProposalExecutorV2");
    const executor = await Executor.connect(admin).deploy(admin.address);
    await executor.waitForDeployment();

    const Governor = await ghost.getContractFactory("GovernorV2");
    const governor = await Governor.connect(admin).deploy(
      admin.address,
      await escrow.getAddress(),
      await executor.getAddress(),
      ghost.parseUnits("10"), // quorum
      0,
      5,
      1
    );
    await governor.waitForDeployment();
    await (await executor.connect(admin).transferAdmin(await governor.getAddress())).wait();

    const AddressBook = await ghost.getContractFactory("AddressBook");
    const addressBook = await AddressBook.connect(admin).deploy(admin.address);
    await addressBook.waitForDeployment();
    await (await addressBook.connect(admin).transferAdmin(await executor.getAddress())).wait();

    const target = await addressBook.getAddress();
    const calldata = addressBook.interface.encodeFunctionData("setAddress", [ghost.id("demo"), voter.address]);
    const proposalId = await governor.connect(admin).propose.staticCall(target, calldata);
    await (await governor.connect(admin).propose(target, calldata)).wait();
    await (await governor.connect(voter).castVote(proposalId, true)).wait();
    await ghost.provider.send("evm_increaseTime", [10]);
    await ghost.provider.send("evm_mine", []);
    await (await governor.connect(admin).queue(proposalId)).wait();
    await ghost.provider.send("evm_increaseTime", [2]);
    await ghost.provider.send("evm_mine", []);
    await expect(governor.connect(admin).execute(proposalId)).to.emit(governor, "ProposalExecuted");
  });
});
