import { ghost } from "hardhat";

const L2_FACTORY_DEFAULT = "0x4200000000000000000000000000000000000012";
const CREATED_TOPIC0 = ghost.id("OptimismMintableERC20Created(address,address,address)");
const FACTORY_EVENT_ABI = [
  "event OptimismMintableERC20Created(address indexed localToken, address indexed remoteToken, address deployer)"
];

function localTokenFromFactoryLog(log: ghost.Log): string | null {
  try {
    const iface = new ghost.Interface(FACTORY_EVENT_ABI);
    const parsed = iface.parseLog(log);
    const localToken = parsed?.args?.localToken as string | undefined;
    return localToken ?? null;
  } catch {
    return null;
  }
}

async function findExistingLocalToken(
  provider: ghost.Provider,
  factory: string,
  remoteToken: string,
  latestBlock: number,
  lookback: number
): Promise<string | null> {
  const remoteTopic = ghost.zeroPadValue(remoteToken, 32);

  const recentFromBlock = Math.max(0, latestBlock - Math.max(0, lookback));
  try {
    const recentLogs = await provider.getLogs({
      address: factory,
      fromBlock: recentFromBlock,
      toBlock: "latest",
      topics: [CREATED_TOPIC0, null, remoteTopic]
    });
    if (recentLogs.length > 0) {
      const local = localTokenFromFactoryLog(recentLogs[recentLogs.length - 1]!);
      if (local) return local;
    }
  } catch {
    // continue to full-history scan
  }

  const chunkSize = Math.max(10_000, Number(process.env.DEMO_LOG_CHUNK_SIZE ?? "200000"));
  for (let from = 0; from <= latestBlock; from += chunkSize) {
    const to = Math.min(latestBlock, from + chunkSize - 1);
    try {
      const logs = await provider.getLogs({
        address: factory,
        fromBlock: from,
        toBlock: to,
        topics: [CREATED_TOPIC0, null, remoteTopic]
      });
      if (logs.length > 0) {
        const local = localTokenFromFactoryLog(logs[logs.length - 1]!);
        if (local) return local;
      }
    } catch {
      // continue scanning remaining ranges
    }
  }

  return null;
}

async function main() {
  const l1Token = process.env.L1_TOKEN_ADDRESS;
  const l2Token = process.env.L2_TOKEN_ADDRESS;
  const l2Factory = process.env.L2_MINTABLE_ERC20_FACTORY ?? L2_FACTORY_DEFAULT;
  const l1Rpc = process.env.RPC_L1;

  if (!l1Token) {
    throw new Error("Missing env L1_TOKEN_ADDRESS");
  }

  const [signer] = await ghost.getSigners();
  const l2Provider = signer.provider;
  if (!l2Provider) {
    throw new Error("Missing L2 provider for signer");
  }

  const MintableAbi = [
    "function l1Token() view returns (address)"
  ];

  if (l2Token) {
    try {
      const existing = new ghost.Contract(l2Token, MintableAbi, l2Provider);
      const remote = await existing.l1Token();
      if (remote.toLowerCase() === l1Token.toLowerCase()) {
        console.log(`L2_TOKEN_ADDRESS=${l2Token}`);
        return;
      }
    } catch {
      // fall through to create
    }
  }

  const latest = await l2Provider.getBlockNumber();
  const lookback = Number(process.env.DEMO_LOG_LOOKBACK ?? "50000");
  const discoveredLocal = await findExistingLocalToken(l2Provider, l2Factory, l1Token, latest, lookback);
  if (discoveredLocal) {
    console.log(`L2_TOKEN_ADDRESS=${discoveredLocal}`);
    return;
  }

  let name = process.env.L1_TOKEN_NAME ?? "Ghost L1 Token";
  let symbol = process.env.L1_TOKEN_SYMBOL ?? "GL1";
  if (l1Rpc) {
    try {
      const l1Provider = new ghost.JsonRpcProvider(l1Rpc);
      const erc20Abi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)"
      ];
      const l1Erc20 = new ghost.Contract(l1Token, erc20Abi, l1Provider);
      name = await l1Erc20.name();
      symbol = await l1Erc20.symbol();
    } catch {
      // keep defaults
    }
  }

  const FactoryAbi = [
    ...FACTORY_EVENT_ABI,
    "function createOptimismMintableERC20(address remoteToken,string name,string symbol) returns (address)"
  ];
  const factory = new ghost.Contract(l2Factory, FactoryAbi, signer);
  let tx: ghost.ContractTransactionResponse;
  try {
    tx = await factory.createOptimismMintableERC20(l1Token, name, symbol);
  } catch (createErr) {
    const afterRevertLatest = await l2Provider.getBlockNumber();
    const discoveredAfterRevert = await findExistingLocalToken(
      l2Provider,
      l2Factory,
      l1Token,
      afterRevertLatest,
      lookback
    );
    if (discoveredAfterRevert) {
      console.log(`L2_TOKEN_ADDRESS=${discoveredAfterRevert}`);
      return;
    }
    throw createErr;
  }
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
