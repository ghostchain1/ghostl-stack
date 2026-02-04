import { ethers } from "ethers";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const RPC_L1 = process.env.RPC_L1 ?? "http://localhost:8545";
const RPC_L2 = process.env.RPC_L2 ?? "http://localhost:9545";
const RPC_L3 = process.env.RPC_L3 ?? "http://localhost:10545";

const L1_ROLLUP_L2 = process.env.L1_ROLLUP_L2_ADDRESS!;
const L2_ROLLUP_L3 = process.env.L2_ROLLUP_L3_ADDRESS!;
const BRIDGE = process.env.BRIDGE_L2L3_ADDRESS!;
const L3_INBOX = process.env.L3_INBOX_ADDRESS!;
const L3_FACTORY = process.env.L3_TOKEN_FACTORY_ADDRESS!;
const L3_TOKEN = process.env.L3_TOKEN_ADDRESS!;

const RELAYER_ADDRESS = process.env.RELAYER_ADDRESS!;
const PROPOSER_L2_ON_L1 = process.env.PROPOSER_L2_ON_L1_ADDRESS!;
const PROPOSER_L3_ON_L2 = process.env.PROPOSER_L3_ON_L2_ADDRESS!;

function requireAddr(name: string, value: string) {
  if (!value || !ethers.isAddress(value)) throw new Error(`Missing/invalid ${name}`);
  return ethers.getAddress(value);
}

async function main() {
  if (!DEPLOYER_PRIVATE_KEY) {
    throw new Error("Missing DEPLOYER_PRIVATE_KEY (refusing to use a built-in dev key)");
  }
  const l1 = new ethers.JsonRpcProvider(RPC_L1);
  const l2 = new ethers.JsonRpcProvider(RPC_L2);
  const l3 = new ethers.JsonRpcProvider(RPC_L3);

  const ownerL1 = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, l1);
  const ownerL2 = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, l2);
  const ownerL3 = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, l3);

  const l1RollupAddr = requireAddr("L1_ROLLUP_L2_ADDRESS", L1_ROLLUP_L2);
  const l2RollupAddr = requireAddr("L2_ROLLUP_L3_ADDRESS", L2_ROLLUP_L3);
  const bridgeAddr = requireAddr("BRIDGE_L2L3_ADDRESS", BRIDGE);
  const inboxAddr = requireAddr("L3_INBOX_ADDRESS", L3_INBOX);
  const factoryAddr = requireAddr("L3_TOKEN_FACTORY_ADDRESS", L3_FACTORY);
  const tokenAddr = requireAddr("L3_TOKEN_ADDRESS", L3_TOKEN);

  const relayerAddr = requireAddr("RELAYER_ADDRESS", RELAYER_ADDRESS);
  const proposerL2 = requireAddr("PROPOSER_L2_ON_L1_ADDRESS", PROPOSER_L2_ON_L1);
  const proposerL3 = requireAddr("PROPOSER_L3_ON_L2_ADDRESS", PROPOSER_L3_ON_L2);

  const rollupAbi = ["function setProposer(address p) external", "function proposer() view returns (address)"];
  const bridgeAbi = ["function setRelayer(address r) external", "function relayer() view returns (address)"];
  const inboxAbi = ["function setRelayer(address r) external", "function relayer() view returns (address)"];
  const factoryAbi = ["function setRelayer(address r) external", "function relayer() view returns (address)"];
  const l3TokenAbi = ["function setRelayer(address r) external", "function relayer() view returns (address)"];

  const l1Rollup = new ethers.Contract(l1RollupAddr, rollupAbi, ownerL1);
  const l2Rollup = new ethers.Contract(l2RollupAddr, rollupAbi, ownerL2);
  const bridge = new ethers.Contract(bridgeAddr, bridgeAbi, ownerL2);
  const inbox = new ethers.Contract(inboxAddr, inboxAbi, ownerL3);
  const factory = new ethers.Contract(factoryAddr, factoryAbi, ownerL3);
  const token = new ethers.Contract(tokenAddr, l3TokenAbi, ownerL3);

  if (ethers.getAddress(await l1Rollup.proposer()) !== proposerL2) {
    const tx = await l1Rollup.setProposer(proposerL2);
    await tx.wait();
    console.log("Set L1 rollup proposer:", proposerL2, "tx=", tx.hash);
  }

  if (ethers.getAddress(await l2Rollup.proposer()) !== proposerL3) {
    const tx = await l2Rollup.setProposer(proposerL3);
    await tx.wait();
    console.log("Set L2 rollup proposer:", proposerL3, "tx=", tx.hash);
  }

  if (ethers.getAddress(await bridge.relayer()) !== relayerAddr) {
    const tx = await bridge.setRelayer(relayerAddr);
    await tx.wait();
    console.log("Set L2 bridge relayer:", relayerAddr, "tx=", tx.hash);
  }

  if (ethers.getAddress(await inbox.relayer()) !== relayerAddr) {
    const tx = await inbox.setRelayer(relayerAddr);
    await tx.wait();
    console.log("Set L3 inbox relayer:", relayerAddr, "tx=", tx.hash);
  }

  if (ethers.getAddress(await factory.relayer()) !== relayerAddr) {
    const tx = await factory.setRelayer(relayerAddr);
    await tx.wait();
    console.log("Set L3 factory relayer:", relayerAddr, "tx=", tx.hash);
  }

  if (ethers.getAddress(await token.relayer()) !== relayerAddr) {
    const tx = await token.setRelayer(relayerAddr);
    await tx.wait();
    console.log("Set L3 token relayer:", relayerAddr, "tx=", tx.hash);
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
