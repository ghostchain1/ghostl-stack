import { expect } from "chai";
import { ethers } from "hardhat";

const deployTestToken = async (owner: { address: string }) => {
  const Token = await ethers.getContractFactory("TestERC20");
  const token = await Token.connect(owner).deploy("Ghost Token (L2)", "GHOSTL2", 18);
  await token.waitForDeployment();
  return token;
};

describe("ERC20 bridge (MVP)", function () {
  it("escrows on L2, mints on L3, burns and releases back to L2", async function () {
    const [owner, user, relayer] = await ethers.getSigners();

    const Policy = await ethers.getContractFactory("GuardPolicy");
    const policy = await Policy.connect(owner).deploy();
    await policy.waitForDeployment();

    const Bridge = await ethers.getContractFactory("L2L3Bridge");
    const bridge = await Bridge.connect(owner).deploy(await policy.getAddress());
    await bridge.waitForDeployment();
    await (await bridge.connect(owner).setRelayer(relayer.address)).wait();
    await (await bridge.connect(owner).setRequireComplianceRoot(false)).wait();

    const amount = ethers.parseEther("1");
    const nonce = 1n;

    const l2Token = await deployTestToken(owner);
    await (await l2Token.connect(owner).mint(owner.address, amount)).wait();

    await (await l2Token.connect(owner).transfer(user.address, amount)).wait();
    expect(await l2Token.balanceOf(user.address)).to.equal(amount);

    await (await l2Token.connect(user).approve(await bridge.getAddress(), amount)).wait();
    await expect(bridge.connect(user).depositERC20ToL3(await l2Token.getAddress(), user.address, amount, nonce))
      .to.emit(bridge, "ERC20DepositInitiated")
      .withArgs(await l2Token.getAddress(), user.address, user.address, amount, nonce);

    expect(await l2Token.balanceOf(await bridge.getAddress())).to.equal(amount);

    await expect(bridge.connect(relayer).finalizeERC20ToL3(await l2Token.getAddress(), user.address, user.address, amount, nonce))
      .to.emit(bridge, "ERC20Finalized")
      .withArgs(await l2Token.getAddress(), user.address, user.address, amount, nonce);

    const Factory = await ethers.getContractFactory("L3BridgedTokenFactory");
    const factory = await Factory.connect(owner).deploy(relayer.address);
    await factory.waitForDeployment();

    const deployTx = await factory
      .connect(relayer)
      .getOrDeployBridgedToken(await l2Token.getAddress(), "Ghost Token (L2) (L3)", "GHOSTL3", 18);
    const receipt = await deployTx.wait();
    const event = receipt?.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "BridgedTokenDeployed");
    const l3TokenAddr = event?.args?.l3Token as string;
    expect(ethers.isAddress(l3TokenAddr)).to.equal(true);

    const l3Token = await ethers.getContractAt("L3BridgedToken", l3TokenAddr);

    await expect(l3Token.connect(relayer).mintFromL2(user.address, user.address, amount, nonce)).to.emit(
      l3Token,
      "MintedFromL2"
    );
    expect(await l3Token.balanceOf(user.address)).to.equal(amount);

    await expect(l3Token.connect(relayer).mintFromL2(user.address, user.address, amount, nonce)).to.be.revertedWith("already");

    await expect(l3Token.connect(user).burnToL2(user.address, amount, nonce)).to.emit(l3Token, "BurnInitiated");
    expect(await l3Token.balanceOf(user.address)).to.equal(0n);

    await expect(bridge.connect(user).releaseERC20FromL3(await l2Token.getAddress(), user.address, user.address, amount, nonce))
      .to.be.revertedWith("not relayer");

    await expect(bridge.connect(relayer).releaseERC20FromL3(await l2Token.getAddress(), user.address, user.address, amount, nonce))
      .to.emit(bridge, "ERC20WithdrawReleased")
      .withArgs(await l2Token.getAddress(), user.address, user.address, amount, nonce);

    expect(await l2Token.balanceOf(user.address)).to.equal(amount);

    await expect(bridge.connect(relayer).releaseERC20FromL3(await l2Token.getAddress(), user.address, user.address, amount, nonce))
      .to.be.revertedWith("already");
  });

  it("blocks releases when policy is paused", async function () {
    const [owner, user, relayer] = await ethers.getSigners();

    const Policy = await ethers.getContractFactory("GuardPolicy");
    const policy = await Policy.connect(owner).deploy();
    await policy.waitForDeployment();

    const Bridge = await ethers.getContractFactory("L2L3Bridge");
    const bridge = await Bridge.connect(owner).deploy(await policy.getAddress());
    await bridge.waitForDeployment();
    await (await bridge.connect(owner).setRelayer(relayer.address)).wait();
    await (await bridge.connect(owner).setRequireComplianceRoot(false)).wait();

    const amount = ethers.parseEther("1");
    const nonce = 2n;

    const l2Token = await deployTestToken(owner);
    await (await l2Token.connect(owner).mint(owner.address, amount)).wait();

    await (await l2Token.connect(owner).transfer(user.address, amount)).wait();
    await (await l2Token.connect(user).approve(await bridge.getAddress(), amount)).wait();
    await (await bridge.connect(user).depositERC20ToL3(await l2Token.getAddress(), user.address, amount, nonce)).wait();

    await (await bridge.connect(relayer).finalizeERC20ToL3(await l2Token.getAddress(), user.address, user.address, amount, nonce)).wait();

    // Pause policy: Mode.PAUSE == 2
    await (await policy.connect(owner).setMode(2)).wait();

    await expect(bridge.connect(relayer).releaseERC20FromL3(await l2Token.getAddress(), user.address, user.address, amount, nonce))
      .to.be.revertedWith("blocked by policy");
  });
});
