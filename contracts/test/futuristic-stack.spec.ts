import { expect } from "chai";
import { ethers } from "hardhat";

describe("Futuristic stack primitives", () => {
  it("handles stake delegation, slashing, rewards, and withdrawals", async () => {
    const [admin, alice, bob] = await ethers.getSigners();
    const Treasury = await ethers.getContractFactory("TreasuryV2");
    const treasury = await Treasury.connect(admin).deploy(admin.address);
    await treasury.waitForDeployment();

    const Staking = await ethers.getContractFactory("StakingManagerV2");
    const staking = await Staking.connect(admin).deploy(admin.address, await treasury.getAddress());
    await staking.waitForDeployment();

    const Slashing = await ethers.getContractFactory("SlashingManagerV2");
    const slashing = await Slashing.connect(admin).deploy(admin.address, await staking.getAddress());
    await slashing.waitForDeployment();
    await (await staking.connect(admin).setSlashManager(await slashing.getAddress())).wait();

    const Rewards = await ethers.getContractFactory("RewardDistributorV2");
    const rewards = await Rewards.connect(admin).deploy(admin.address, await treasury.getAddress());
    await rewards.waitForDeployment();

    const stakeAmount = ethers.parseEther("10");
    await staking.connect(alice).delegateStake(admin.address, { value: stakeAmount });
    const pool = await staking.pools(admin.address);
    expect(pool.totalStake).to.equal(stakeAmount);

    // Slash 2 GST to treasury
    await expect(slashing.connect(admin).slash(admin.address, ethers.parseEther("2"), "downtime")).to.emit(
      slashing,
      "Slashed"
    );
    const poolAfterSlash = await staking.pools(admin.address);
    expect(poolAfterSlash.totalStake).to.equal(ethers.parseEther("8"));
    const treasuryAfterSlash = await ethers.provider.getBalance(await treasury.getAddress());
    expect(treasuryAfterSlash).to.equal(ethers.parseEther("2"));

    const beforeWithdraw = treasuryAfterSlash;
    const withdrawable = await staking.previewWithdraw(admin.address, await staking.shares(admin.address, alice.address));
    await expect(staking.connect(alice).withdrawStake(admin.address, await staking.shares(admin.address, alice.address), alice.address)).to.emit(
      staking,
      "StakeWithdrawn"
    );
    const afterWithdraw = await ethers.provider.getBalance(await treasury.getAddress());
    expect(afterWithdraw).to.equal(beforeWithdraw);
    expect(withdrawable).to.equal(ethers.parseEther("8"));

    // Push rewards and claim
    await rewards.connect(admin).depositReward(admin.address, { value: ethers.parseEther("1") });
    await expect(rewards.connect(alice).claim(admin.address, alice.address)).to.emit(rewards, "RewardClaimed");
  });

  it("mints and repays stablecoin against collateral with oracle pricing", async () => {
    const [admin, user] = await ethers.getSigners();
    const Stable = await ethers.getContractFactory("Stablecoin");
    const stable = await Stable.connect(admin).deploy(admin.address);
    await stable.waitForDeployment();

    const Native = await ethers.getContractFactory("NativeTokenV2");
    const native = await Native.connect(admin).deploy(admin.address);
    await native.waitForDeployment();

    const Vault = await ethers.getContractFactory("CollateralVault");
    const vault = await Vault.connect(admin).deploy(admin.address);
    await vault.waitForDeployment();
    await (await vault.connect(admin).setCollateralAsset(await native.getAddress(), true)).wait();

    const Oracle = await ethers.getContractFactory("PriceOracleRouter");
    const oracle = await Oracle.connect(admin).deploy(admin.address);
    await oracle.waitForDeployment();
    const assetId = ethers.keccak256(ethers.solidityPacked(["address"], [await native.getAddress()]));
    await (await oracle.connect(admin).setPrice(assetId, ethers.parseUnits("1", 18))).wait();

    const Controller = await ethers.getContractFactory("StablecoinController");
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
    await (await native.connect(admin).mint(user.address, ethers.parseEther("200"))).wait();
    await (await native.connect(user).approve(await vault.getAddress(), ethers.parseEther("200"))).wait();
    await (await vault.connect(user).deposit(await native.getAddress(), ethers.parseEther("200"))).wait();

    await expect(
      controller.connect(user).mintAgainstCollateral(await native.getAddress(), ethers.parseEther("150"), ethers.parseEther("100"))
    ).to.emit(controller, "Minted");
    expect(await stable.balanceOf(user.address)).to.equal(ethers.parseEther("100"));

    await (await stable.connect(user).approve(await controller.getAddress(), ethers.parseEther("100"))).wait();
    await expect(
      controller.connect(user).repay(await native.getAddress(), ethers.parseEther("100"), ethers.parseEther("150"))
    ).to.emit(controller, "Repaid");
    expect(await stable.balanceOf(user.address)).to.equal(0n);
  });

  it("bridges ERC20 with locking and release, and finalizes rollup outputs after clean disputes", async () => {
    const [admin, user, relayer] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("NativeTokenV2");
    const token = await Token.connect(admin).deploy(admin.address);
    await token.waitForDeployment();
    await (await token.connect(admin).mint(user.address, ethers.parseEther("50"))).wait();

    const Bridge = await ethers.getContractFactory("TokenBridge");
    const bridge = await Bridge.connect(admin).deploy(admin.address);
    await bridge.waitForDeployment();

    await (await token.connect(user).approve(await bridge.getAddress(), ethers.parseEther("10"))).wait();
    await expect(bridge.connect(user).deposit(await token.getAddress(), user.address, ethers.parseEther("10"), 902)).to.emit(
      bridge,
      "DepositInitiated"
    );
    expect(await token.balanceOf(await bridge.getAddress())).to.equal(ethers.parseEther("10"));

    const messageId = ethers.id("msg-1");
    await expect(
      bridge.connect(admin).finalizeWithdrawal(messageId, await token.getAddress(), relayer.address, ethers.parseEther("10"), 901)
    ).to.emit(bridge, "WithdrawalFinalized");
    expect(await token.balanceOf(relayer.address)).to.equal(ethers.parseEther("10"));

    // Dispute/finalization
    const Disputes = await ethers.getContractFactory("DisputeGameFactoryV2");
    const disputes = await Disputes.connect(admin).deploy(admin.address);
    await disputes.waitForDeployment();
    const OutputOracle = await ethers.getContractFactory("OutputOracle");
    const oracle = await OutputOracle.connect(admin).deploy(admin.address);
    await oracle.waitForDeployment();
    const Finalization = await ethers.getContractFactory("FinalizationManager");
    const finalization = await Finalization.connect(admin).deploy(
      admin.address,
      await disputes.getAddress(),
      await oracle.getAddress(),
      0
    );
    await finalization.waitForDeployment();

    const disputeId = await disputes.connect(admin).createGame.staticCall(relayer.address, ethers.ZeroHash);
    await (await disputes.connect(admin).createGame(relayer.address, ethers.ZeroHash)).wait();
    const gameAddr = await disputes.games(disputeId);
    const game = await ethers.getContractAt("FaultDisputeGame", gameAddr);
    await (await game.connect(admin).resolve(false)).wait();
    await expect(finalization.connect(admin).finalizeWithDispute(1, ethers.ZeroHash, disputeId)).to.emit(
      finalization,
      "BlockFinalized"
    );
  });

  it("walks governance lifecycle with quorum and timelock", async () => {
    const [admin, voter] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GovernanceToken");
    const token = await Token.connect(admin).deploy(admin.address);
    await token.waitForDeployment();
    await (await token.connect(admin).mint(voter.address, ethers.parseEther("1000"))).wait();

    const Escrow = await ethers.getContractFactory("VotingEscrow");
    const escrow = await Escrow.connect(admin).deploy(admin.address);
    await escrow.waitForDeployment();
    await (await escrow.connect(voter).lock(ethers.parseEther("1000"), Math.floor(Date.now() / 1000) + 86400)).wait();

    const Executor = await ethers.getContractFactory("ProposalExecutorV2");
    const executor = await Executor.connect(admin).deploy(admin.address);
    await executor.waitForDeployment();

    const Governor = await ethers.getContractFactory("GovernorV2");
    const governor = await Governor.connect(admin).deploy(
      admin.address,
      await escrow.getAddress(),
      await executor.getAddress(),
      ethers.parseUnits("10"), // quorum
      0,
      5,
      1
    );
    await governor.waitForDeployment();
    await (await executor.connect(admin).transferAdmin(await governor.getAddress())).wait();

    const AddressBook = await ethers.getContractFactory("AddressBook");
    const addressBook = await AddressBook.connect(admin).deploy(admin.address);
    await addressBook.waitForDeployment();
    await (await addressBook.connect(admin).transferAdmin(await executor.getAddress())).wait();

    const target = await addressBook.getAddress();
    const calldata = addressBook.interface.encodeFunctionData("setAddress", [ethers.id("demo"), voter.address]);
    const proposalId = await governor.connect(admin).propose.staticCall(target, calldata);
    await (await governor.connect(admin).propose(target, calldata)).wait();
    await (await governor.connect(voter).castVote(proposalId, true)).wait();
    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);
    await (await governor.connect(admin).queue(proposalId)).wait();
    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine", []);
    await expect(governor.connect(admin).execute(proposalId)).to.emit(governor, "ProposalExecuted");
  });
});
