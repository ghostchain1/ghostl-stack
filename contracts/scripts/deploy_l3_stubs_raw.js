const { ghost } = require("ghost");
const fs = require("fs");
const rpc = process.env.RPC_L2 || "http://l2-geth:8545";
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("Missing DEPLOYER_PRIVATE_KEY (refusing to use a built-in dev key)");
  process.exit(1);
}
const provider = new ghost.JsonRpcProvider(rpc);
const signer = new ghost.Wallet(pk, provider);
async function main() {
  const [nonce] = [await provider.getTransactionCount(signer.address, "pending")];
  const l2ooArtifact = JSON.parse(fs.readFileSync("artifacts/src/MockL2OutputOracle.sol/MockL2OutputOracle.json"));
  const dgfArtifact = JSON.parse(fs.readFileSync("artifacts/src/MockDisputeGameFactory.sol/MockDisputeGameFactory.json"));
  const l2ooFactory = new ghost.ContractFactory(l2ooArtifact.abi, l2ooArtifact.bytecode, signer);
  const dgfFactory = new ghost.ContractFactory(dgfArtifact.abi, dgfArtifact.bytecode, signer);

  const l2ooTxReq = await l2ooFactory.getDeployTransaction(0);
  l2ooTxReq.nonce = nonce;
  const l2ooAddr = ghost.getCreateAddress({ from: signer.address, nonce });
  const l2ooTx = await signer.sendTransaction(l2ooTxReq);
  console.log("L2OO tx", l2ooTx.hash, "nonce", nonce, "expected address", l2ooAddr);

  const dgfTxReq = await dgfFactory.getDeployTransaction();
  dgfTxReq.nonce = nonce + 1;
  const dgfAddr = ghost.getCreateAddress({ from: signer.address, nonce: nonce + 1 });
  const dgfTx = await signer.sendTransaction(dgfTxReq);
  console.log("DGF tx", dgfTx.hash, "nonce", nonce + 1, "expected address", dgfAddr);
}
main().catch((e) => { console.error(e); process.exit(1); });
