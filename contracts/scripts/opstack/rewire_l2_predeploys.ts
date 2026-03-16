import { ghost } from "hardhat";
import fs from "node:fs";
import path from "node:path";
import { getCreateAddress } from "@ghostchain/sdk";

type L1Deployments = Record<string, string>;

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function pickAddr(obj: L1Deployments, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.startsWith("0x") && v.length === 42) return v;
  }
  return undefined;
}

async function main() {
  // Hardhat runs from `contracts/`. Default to repo root relative to this script location.
  const contractsRoot = path.resolve(__dirname, "..", "..");
  const repoRoot = process.env.ROOT_DIR ?? path.resolve(contractsRoot, "..");
  const l1DeploymentsPath =
    process.env.L1_DEPLOYMENTS_JSON ??
    path.join(repoRoot, "infra", "opstack", "config", "l1-deployments.custom.json");

  if (!fs.existsSync(l1DeploymentsPath)) {
    throw new Error(`Missing L1 deployments JSON: ${l1DeploymentsPath}`);
  }

  const l1 = readJson<L1Deployments>(l1DeploymentsPath);
  const l1Xdm = pickAddr(l1, ["L1CrossDomainMessengerProxy", "L1CrossDomainMessenger"]);
  const l1StdBridge = pickAddr(l1, ["L1StandardBridgeProxy", "L1StandardBridge"]);

  if (!l1Xdm || !l1StdBridge) {
    throw new Error(
      `Missing L1CrossDomainMessenger/L1StandardBridge in ${l1DeploymentsPath} (expected keys like L1CrossDomainMessengerProxy or L1CrossDomainMessenger)`
    );
  }

  const l2ProxyAdmin = "0x4200000000000000000000000000000000000018";
  const l2XdmProxy = "0x4200000000000000000000000000000000000007";
  const l2StdBridgeProxy = "0x4200000000000000000000000000000000000010";

  // Storage slots on L2 predeploy proxies (validated by reading current values first).
  const SLOT_OTHER_MESSENGER = ghost.zeroPadValue(ghost.toBeHex(0xcf), 32);
  const SLOT_OTHER_BRIDGE = ghost.zeroPadValue(ghost.toBeHex(0x04), 32);

  const [signer] = await ghost.getSigners();
  const signerAddr = await signer.getAddress();

  const ProxyAdminAbi = [
    "function owner() view returns (address)",
    "function upgrade(address proxy,address implementation)",
    "function upgradeAndCall(address proxy,address implementation,bytes data) payable"
  ];
  const proxyAdmin = new ghost.Contract(l2ProxyAdmin, ProxyAdminAbi, signer);

  const owner = (await proxyAdmin.owner()) as string;
  if (owner.toLowerCase() !== signerAddr.toLowerCase()) {
    throw new Error(
      `Signer ${signerAddr} is not L2 ProxyAdmin owner (${owner}). Set DEPLOYER_PRIVATE_KEY to the ProxyAdmin owner key.`
    );
  }

  const L2XdmViewAbi = ["function l1CrossDomainMessenger() view returns (address)"];
  const l2Xdm = new ghost.Contract(l2XdmProxy, L2XdmViewAbi, signer.provider);
  const L2BridgeViewAbi = ["function l1TokenBridge() view returns (address)"];
  const l2Bridge = new ghost.Contract(l2StdBridgeProxy, L2BridgeViewAbi, signer.provider);

  const currentOtherMessenger = (await l2Xdm.l1CrossDomainMessenger()) as string;
  const slotOtherMessenger = await signer.provider!.getStorage(l2XdmProxy, SLOT_OTHER_MESSENGER);
  if (!slotOtherMessenger.toLowerCase().endsWith(currentOtherMessenger.toLowerCase().slice(2))) {
    throw new Error(
      `Unexpected storage at SLOT_OTHER_MESSENGER=${SLOT_OTHER_MESSENGER} (value=${slotOtherMessenger}, view=${currentOtherMessenger}). Refusing to patch.`
    );
  }

  const currentOtherBridge = (await l2Bridge.l1TokenBridge()) as string;
  const slotOtherBridge = await signer.provider!.getStorage(l2StdBridgeProxy, SLOT_OTHER_BRIDGE);
  if (!slotOtherBridge.toLowerCase().endsWith(currentOtherBridge.toLowerCase().slice(2))) {
    throw new Error(
      `Unexpected storage at SLOT_OTHER_BRIDGE=${SLOT_OTHER_BRIDGE} (value=${slotOtherBridge}, view=${currentOtherBridge}). Refusing to patch.`
    );
  }

  console.log("L1 targets:");
  console.log("  L1CrossDomainMessenger:", l1Xdm);
  console.log("  L1StandardBridge:", l1StdBridge);
  console.log("Current L2 remote wiring:");
  console.log("  L2XDM.otherMessenger:", currentOtherMessenger);
  console.log("  L2StandardBridge.otherBridge:", currentOtherBridge);

  if (
    currentOtherMessenger.toLowerCase() === l1Xdm.toLowerCase() &&
    currentOtherBridge.toLowerCase() === l1StdBridge.toLowerCase()
  ) {
    console.log("Already wired correctly. Nothing to do.");
    return;
  }

  // This devnet predeploys contracts at the common Hardhat CREATE addresses, which can cause
  // `contract address collision` for the first few nonces. Bump nonce with a harmless self-tx
  // until the next CREATE address is free.
  for (let i = 0; i < 50; i++) {
    const nonce = await signer.provider!.getTransactionCount(signerAddr, "pending");
    const nextCreate = getCreateAddress({ from: signerAddr, nonce });
    const code = await signer.provider!.getCode(nextCreate);
    if (code === "0x") break;
    console.log(`Nonce bump: CREATE(${nonce}) would collide at ${nextCreate}; sending 0-value self-tx...`);
    const bump = await signer.sendTransaction({ to: signerAddr, value: 0n });
    await bump.wait();
  }

  const Setter = await ghost.getContractFactory("ProxyStorageSetter", signer);
  const setter = await Setter.deploy(l2ProxyAdmin);
  await setter.waitForDeployment();
  const setterAddr = await setter.getAddress();
  console.log("Deployed ProxyStorageSetter:", setterAddr);

  const setterIface = setter.interface;
  const setterDataMessenger = setterIface.encodeFunctionData("setAddress", [SLOT_OTHER_MESSENGER, l1Xdm]);
  const setterDataBridge = setterIface.encodeFunctionData("setAddress", [SLOT_OTHER_BRIDGE, l1StdBridge]);

  // Read original implementations from EIP-1967 slot so we can restore them after patching.
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const origXdmImpl = await signer.provider!.getStorage(l2XdmProxy, IMPL_SLOT);
  const origBridgeImpl = await signer.provider!.getStorage(l2StdBridgeProxy, IMPL_SLOT);
  const origXdmImplAddr = ghost.getAddress(ghost.dataSlice(origXdmImpl, 12));
  const origBridgeImplAddr = ghost.getAddress(ghost.dataSlice(origBridgeImpl, 12));
  console.log("Original implementations:");
  console.log("  L2XDM:", origXdmImplAddr);
  console.log("  L2StandardBridge:", origBridgeImplAddr);

  // Patch L2 XDM.
  console.log("Patching L2CrossDomainMessenger otherMessenger...");
  let tx = await proxyAdmin.upgradeAndCall(l2XdmProxy, setterAddr, setterDataMessenger);
  await tx.wait();
  tx = await proxyAdmin.upgrade(l2XdmProxy, origXdmImplAddr);
  await tx.wait();

  // Patch L2 Standard Bridge.
  console.log("Patching L2StandardBridge otherBridge...");
  tx = await proxyAdmin.upgradeAndCall(l2StdBridgeProxy, setterAddr, setterDataBridge);
  await tx.wait();
  tx = await proxyAdmin.upgrade(l2StdBridgeProxy, origBridgeImplAddr);
  await tx.wait();

  const newOtherMessenger = (await l2Xdm.l1CrossDomainMessenger()) as string;
  const newOtherBridge = (await l2Bridge.l1TokenBridge()) as string;
  console.log("Updated L2 remote wiring:");
  console.log("  L2XDM.otherMessenger:", newOtherMessenger);
  console.log("  L2StandardBridge.otherBridge:", newOtherBridge);

  if (newOtherMessenger.toLowerCase() !== l1Xdm.toLowerCase()) {
    throw new Error(`Failed to update L2XDM otherMessenger (expected ${l1Xdm}, got ${newOtherMessenger})`);
  }
  if (newOtherBridge.toLowerCase() !== l1StdBridge.toLowerCase()) {
    throw new Error(`Failed to update L2StandardBridge otherBridge (expected ${l1StdBridge}, got ${newOtherBridge})`);
  }

  console.log("OK: L2 predeploy wiring updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
