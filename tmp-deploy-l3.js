const { ethers } = require('ethers');
const rpc = process.env.RPC_L2 || 'http://localhost:29545';
const pk = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const main = async () => {
  const provider = new ethers.JsonRpcProvider(rpc);
  console.log('rpc', rpc);
  console.log('block', await provider.getBlockNumber());
  const signer = new ethers.Wallet(pk, provider);
  console.log('signer', await signer.getAddress());
  const abi = [
    'constructor(uint256)',
    'function latestOutputIndex() view returns (uint256)',
    'function proposeL2Output(bytes32,uint256,bytes32,uint256)'
  ];
  const bytecode = require('./artifacts/contracts/src/MockL2OutputOracle.sol/MockL2OutputOracle.json').bytecode;
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const tx = await factory.getDeployTransaction(0);
  console.log('gas estimate', await provider.estimateGas({ ...tx, from: await signer.getAddress() }));
  const deployTx = await signer.sendTransaction(tx);
  console.log('sent tx', deployTx.hash);
  const receipt = await deployTx.wait();
  console.log('receipt', receipt);
};
main().catch((e) => { console.error(e); process.exit(1); });
