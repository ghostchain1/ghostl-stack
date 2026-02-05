import { ethers } from "hardhat";

const L2_FACTORY_DEFAULT = "0x4200000000000000000000000000000000000012";
const CREATED_TOPIC0 = ethers.id("OptimismMintableERC20Created(address,address,address)");

async function main() {
  const l1Token = process.env.L1_TOKEN_ADDRESS;
  const l2Token = process.env.L2_TOKEN_ADDRESS;
  const l2Factory = process.env.L2_MINTABLE_ERC20_FACTORY ?? L2_FACTORY_DEFAULT;
  const l1Rpc = process.env.RPC_L1;

  if (!l1Token) {
    throw new Error("Missing env L1_TOKEN_ADDRESS");
  }

  const [signer] = await ethers.getSigners();
  const l2Provider = signer.provider;
  if (!l2Provider) {
    throw new Error("Missing L2 provider for signer");
  }

  const MintableAbi = [
    "function l1Token() view returns (address)"
  ];

  if (l2Token) {
    try {
      const existing = new ethers.Contract(l2Token, MintableAbi, l2Provider);
      const remote = await existing.l1Token();
      if (remote.toLowerCase() === l1Token.toLowerCase()) {
        console.log(`L2_TOKEN_ADDRESS=${l2Token}`);
        return;
      }
    } catch {
      // fall through to create
    }
  }

  // Some devnets already have a deterministic OptimismMintableERC20 deployed for this remote token.
  // Avoid a CREATE2 collision revert by discovering an existing deployment via factory event logs.
  try {
    const latest = await l2Provider.getBlockNumber();
    const lookback = Number(process.env.DEMO_LOG_LOOKBACK ?? "50000");
    const fromBlock = Math.max(0, latest - lookback);
    const remoteTopic = ethers.zeroPadValue(l1Token, 32);
    const logs = await l2Provider.getLogs({
      address: l2Factory,
      fromBlock,
      toBlock: "latest",
      topics: [CREATED_TOPIC0, null, remoteTopic]
    });
    if (logs.length > 0) {
      const FactoryAbi = [
        "event OptimismMintableERC20Created(address indexed localToken, address indexed remoteToken, address deployer)"
      ];
      const iface = new ethers.Interface(FactoryAbi);
      const parsed = iface.parseLog(logs[logs.length - 1]);
      const localToken = parsed?.args?.localToken as string | undefined;
      if (localToken) {
        console.log(`L2_TOKEN_ADDRESS=${localToken}`);
        return;
      }
    }
  } catch {
    // fall through to create
  }

  let name = process.env.L1_TOKEN_NAME ?? "Ghost L1 Token";
  let symbol = process.env.L1_TOKEN_SYMBOL ?? "GL1";
  if (l1Rpc) {
    try {
      const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
      const erc20Abi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)"
      ];
      const l1Erc20 = new ethers.Contract(l1Token, erc20Abi, l1Provider);
      name = await l1Erc20.name();
      symbol = await l1Erc20.symbol();
    } catch {
      // keep defaults
    }
  }

  const FactoryAbi = [
    "event OptimismMintableERC20Created(address indexed localToken, address indexed remoteToken, address deployer)",
    "function createOptimismMintableERC20(address remoteToken,string name,string symbol) returns (address)"
  ];
  const factory = new ethers.Contract(l2Factory, FactoryAbi, signer);
  const tx = await factory.createOptimismMintableERC20(l1Token, name, symbol);
  const timeoutMs = Number(process.env.DEMO_TX_TIMEOUT_MS ?? "60000");
  const receipt = await Promise.race([
    tx.wait(),
    new Promise<null>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout waiting for createOptimismMintableERC20 receipt after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
  if (!receipt) {
    throw new Error("Missing receipt for createOptimismMintableERC20");
  }

  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "OptimismMintableERC20Created");

  const localToken = event?.args?.localToken as string | undefined;
  if (!localToken) {
    throw new Error("Unable to find OptimismMintableERC20Created event");
  }

  console.log(`L2_TOKEN_ADDRESS=${localToken}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
