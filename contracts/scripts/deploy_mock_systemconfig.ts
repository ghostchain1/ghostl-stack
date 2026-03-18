import { ghost } from "hardhat";

async function main() {
  const l2Provider = new ghost.JsonRpcProvider(process.env.RPC_L2 ?? "http://localhost:29547");
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) {
    throw new Error("missing_DEPLOYER_PRIVATE_KEY");
  }
  const signer = new ghost.Wallet(deployerKey, l2Provider);

  const unsafeBlockSigner = process.env.UNSAFE_BLOCK_SIGNER ?? "0xc17ebfc8421667bd832090dce4cc8bca1fdef654";
  const l1CrossDomainMessenger = process.env.L1_XDM ?? "0xea7cfd038c520128c244426766fb7d10804002f5";
  const l1GRC721Bridge = process.env.L1_GRC721_BRIDGE ?? "0x71f044d237ca60a55ae31a68bda0319711e73552";
  const l1StandardBridge = process.env.L1_STANDARD_BRIDGE ?? "0x061c137864195998838574da9e822102fa029d70";
  const ghostPortal = process.env.GHOST_PORTAL ?? "0x7423e173cb2970ae4a06f03450a8f07901344c3a";
  const gst20MintableFactory =
    process.env.GST20_MINTABLE_FACTORY ?? "0x69abbde9ebba86707ae2ccf56e9572fbb0d11da6";
  const batchInbox = process.env.BATCH_INBOX ?? "0x00289c189bee4e70334629f04cd5ed602b6600eb";
  const gasLimit = BigInt(process.env.GAS_LIMIT ?? "30000000");
  const baseFeeScalar = BigInt(process.env.BASE_FEE_SCALAR ?? "1368");
  const blobBaseFeeScalar = BigInt(process.env.BLOB_BASE_FEE_SCALAR ?? "0");
  const legacyScalar = BigInt(process.env.LEGACY_SCALAR ?? baseFeeScalar.toString());

  console.log("Deploying MockSystemConfig to L2 via", await signer.getAddress());
  const net = await l2Provider.getNetwork();
  console.log("L2 network", net);
  const Factory = await ghost.getContractFactory("MockSystemConfig", signer);
  const contract = await Factory.deploy(
    unsafeBlockSigner,
    l1CrossDomainMessenger,
    l1GRC721Bridge,
    l1StandardBridge,
    ghostPortal,
    gst20MintableFactory,
    batchInbox,
    gasLimit,
    baseFeeScalar,
    blobBaseFeeScalar,
    legacyScalar
  );
  console.log("Tx hash", contract.deploymentTransaction()?.hash);
  await contract.waitForDeployment();
  console.log("MockSystemConfig deployed at", await contract.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
