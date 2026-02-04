import { expect } from "chai";
import { ethers } from "hardhat";

describe("AI model lock (governance-native)", () => {
  it("enforces model allowlist + freeze via AIModelLock when wired into AICommandCenter", async () => {
    const [admin, aiSigner] = await ethers.getSigners();

    const Constitution = await ethers.getContractFactory("GhostConstitution");
    const constitution = await Constitution.connect(admin).deploy(
      admin.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await constitution.waitForDeployment();

    const Guard = await ethers.getContractFactory("ConstitutionalGuard");
    const guard = await Guard.connect(admin).deploy(
      admin.address,
      ethers.ZeroAddress,
      await constitution.getAddress()
    );
    await guard.waitForDeployment();

    const Anchor = await ethers.getContractFactory("EvidenceAnchor");
    const anchor = await Anchor.connect(admin).deploy(admin.address, ethers.ZeroAddress);
    await anchor.waitForDeployment();

    const Bundle = await ethers.getContractFactory("EvidenceBundle");
    const bundle = await Bundle.connect(admin).deploy(
      admin.address,
      ethers.ZeroAddress,
      await anchor.getAddress()
    );
    await bundle.waitForDeployment();
    // EvidenceBundle anchors via EvidenceAnchor, so the bundle must be governance for the anchor.
    await (await anchor.connect(admin).setGovernance(await bundle.getAddress(), ethers.ZeroAddress)).wait();

    const constitutionHash = ethers.id("ghost.constitution.model-lock.v1");
    const ModelLock = await ethers.getContractFactory("AIModelLock");
    const modelLock = await ModelLock.connect(admin).deploy(
      admin.address,
      ethers.ZeroAddress,
      constitutionHash
    );
    await modelLock.waitForDeployment();

    const CommandCenter = await ethers.getContractFactory("AICommandCenter");
    const ai = await CommandCenter.connect(admin).deploy();
    await ai.waitForDeployment();
    await (await ai.connect(admin).setConstitutionalGuard(await guard.getAddress())).wait();
    await (await ai.connect(admin).setEvidenceBundle(await bundle.getAddress())).wait();

    const Target = await ethers.getContractFactory("DummyTarget");
    const target = await Target.connect(admin).deploy();
    await target.waitForDeployment();
    const pingSelector = target.interface.getFunction("ping").selector;

    await (await ai.connect(admin).setActionPolicy(await target.getAddress(), pingSelector, true, 0, false, 0, 0)).wait();
    await (await ai.connect(admin).setLayerRequired(1, false)).wait();
    await (await ai.connect(admin).setLayerRequired(2, false)).wait();
    await (await ai.connect(admin).setLayerRequired(3, false)).wait();
    await (await ai.connect(admin).setPolicy(1, 86400, false, 1)).wait();
    await (await ai.connect(admin).setSigner(aiSigner.address, true)).wait();

    // Wire governance-native model lock.
    await (await ai.connect(admin).setModelLock(await modelLock.getAddress())).wait();

    const modelId = ethers.id("gpt-5.2-codex-exec");

    const buildDecision = async (nonce: number) => {
      const issuedAt = (await ethers.provider.getBlock("latest"))!.timestamp;
      const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [77]);
      return {
        nonce,
        action: 1,
        target: await target.getAddress(),
        selector: pingSelector,
        data,
        issuedAt,
        validUntil: issuedAt + 3600,
        confidenceBps: 9000,
        l1Digest: ethers.ZeroHash,
        l2Digest: ethers.ZeroHash,
        l3Digest: ethers.ZeroHash,
        offchainDigest: ethers.ZeroHash,
        modelId,
        gasLimit: 0
      };
    };

    const signDecision = async (decision: any) => {
      const network = await ethers.provider.getNetwork();
      const domain = {
        name: "GhostAICommandCenter",
        version: "1",
        chainId: Number(network.chainId),
        verifyingContract: await ai.getAddress()
      };
      const types = {
        Decision: [
          { name: "nonce", type: "uint256" },
          { name: "action", type: "uint8" },
          { name: "target", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "dataHash", type: "bytes32" },
          { name: "issuedAt", type: "uint64" },
          { name: "validUntil", type: "uint64" },
          { name: "confidenceBps", type: "uint32" },
          { name: "l1Digest", type: "bytes32" },
          { name: "l2Digest", type: "bytes32" },
          { name: "l3Digest", type: "bytes32" },
          { name: "offchainDigest", type: "bytes32" },
          { name: "modelId", type: "bytes32" },
          { name: "gasLimit", type: "uint64" }
        ]
      } as const;

      const value = {
        nonce: BigInt(decision.nonce),
        action: decision.action,
        target: decision.target,
        selector: decision.selector,
        dataHash: ethers.keccak256(decision.data),
        issuedAt: decision.issuedAt,
        validUntil: decision.validUntil,
        confidenceBps: decision.confidenceBps,
        l1Digest: decision.l1Digest,
        l2Digest: decision.l2Digest,
        l3Digest: decision.l3Digest,
        offchainDigest: decision.offchainDigest,
        modelId: decision.modelId,
        gasLimit: decision.gasLimit
      } as const;

      const decisionHash = ethers.TypedDataEncoder.hashStruct("Decision", types, value);
      const signature = await aiSigner.signTypedData(domain, types, value);

      return { decisionHash, signature };
    };

    // Reverts if model is not allowlisted in AIModelLock (even if internal allowlist is unset).
    {
      const decision = await buildDecision(1);
      const { decisionHash, signature } = await signDecision(decision);
      const actionHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "address", "bytes4", "bytes32", "uint64"],
          [ethers.id("ghost.ai.command.execute"), decisionHash, decision.target, decision.selector, ethers.keccak256(decision.data), decision.gasLimit]
        )
      );
      await (await constitution.connect(admin).permitAction(actionHash, true)).wait();
      await expect(ai.connect(admin).executeDecision(decision, [signature])).to.be.revertedWith("model not allowed");
    }

    // Allow the model with evidence.
    await (await modelLock.connect(admin).setModel(modelId, true, ethers.id("evidence:allow-model"))).wait();

    // Executes successfully when model is allowlisted and not frozen.
    {
      const decision = await buildDecision(2);
      const { decisionHash, signature } = await signDecision(decision);
      const actionHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "address", "bytes4", "bytes32", "uint64"],
          [ethers.id("ghost.ai.command.execute"), decisionHash, decision.target, decision.selector, ethers.keccak256(decision.data), decision.gasLimit]
        )
      );
      await (await constitution.connect(admin).permitAction(actionHash, true)).wait();
      await (await ai.connect(admin).executeDecision(decision, [signature])).wait();
      expect(await target.lastValue()).to.equal(77n);
    }

    // Freeze blocks execution even for allowlisted model.
    await (await modelLock.connect(admin).setFrozen(true, ethers.id("evidence:freeze"))).wait();
    {
      const decision = await buildDecision(3);
      const { decisionHash, signature } = await signDecision(decision);
      const actionHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "address", "bytes4", "bytes32", "uint64"],
          [ethers.id("ghost.ai.command.execute"), decisionHash, decision.target, decision.selector, ethers.keccak256(decision.data), decision.gasLimit]
        )
      );
      await (await constitution.connect(admin).permitAction(actionHash, true)).wait();
      await expect(ai.connect(admin).executeDecision(decision, [signature])).to.be.revertedWith("frozen");
    }
  });
});
