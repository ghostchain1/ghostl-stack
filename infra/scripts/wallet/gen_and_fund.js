#!/usr/bin/env node
const { ethers } = require('ethers');

const L2_RPC = process.env.L2_RPC || 'http://localhost:29547';
const L3_RPC = process.env.L3_RPC || 'http://localhost:39545';
const FUNDER_PK = process.env.FUNDER_PK;
const TARGET = process.env.TARGET || 'l2';
const AMOUNT = process.env.AMOUNT || '1.0';

if (!FUNDER_PK) {
  console.error('Set FUNDER_PK (funder private key)');
  process.exit(1);
}

(async () => {
  const wallet = ethers.Wallet.createRandom();
  console.log('NEW_WALLET_ADDRESS=', wallet.address);
  console.log('NEW_WALLET_PK=', wallet.privateKey);

  const rpc = TARGET === 'l3' ? L3_RPC : L2_RPC;
  const provider = new ethers.JsonRpcProvider(rpc);
  const funder = new ethers.Wallet(FUNDER_PK, provider);
  console.log(`Funding ${wallet.address} on ${TARGET} from ${funder.address}`);
  const tx = await funder.sendTransaction({ to: wallet.address, value: ethers.parseEther(AMOUNT) });
  await tx.wait();
  console.log('Funded tx=', tx.hash);
})();
