import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { ghost } from "@ghostchain/sdk";

const RPC_URL = process.env.RPC_L1 || process.env.RPC_URL || "";
const RECEIPTS_ADDRESS = process.env.TREASURY_RECEIPTS_ADDRESS || "";
const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS || "";
const EXECUTOR_ADDRESS = process.env.PROPOSAL_EXECUTOR_ADDRESS || "";
const OUTPUT_DIR = process.env.EVIDENCE_OUTPUT_DIR || path.join(process.cwd(), "data");
const FROM_BLOCK = process.env.EVIDENCE_FROM_BLOCK;
const TO_BLOCK = process.env.EVIDENCE_TO_BLOCK;
const AI_RATIONALE_PATH = process.env.AI_RATIONALE_PATH || "";
const AI_REPORT_PATH = process.env.AI_REPORT_PATH || "";
const SIGNER_KEY = process.env.EVIDENCE_SIGNER_KEY || "";

const stableStringify = (value) => {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashOf = (value) => ghost.keccak256(ghost.toUtf8Bytes(stableStringify(value)));

const toSerializable = (value) => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toSerializable(v)]));
  }
  return value;
};

const buildMerkleRoot = (leaves) => {
  if (leaves.length === 0) return ghost.ZeroHash;
  let level = leaves.slice().sort();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(hashOf([left, right]));
    }
    level = next.sort();
  }
  return level[0];
};

const readOptionalJson = (filePath) => {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { raw: fs.readFileSync(filePath, "utf8") };
  }
};

const generatePdf = (filePath, pack) => {
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));
  doc.fontSize(18).text("GhostChain Treasury Evidence Pack", { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Version: ${pack.version}`);
  doc.text(`Chain ID: ${pack.chainId}`);
  doc.text(`From block: ${pack.fromBlock}`);
  doc.text(`To block: ${pack.toBlock}`);
  doc.text(`Generated at: ${pack.generatedAt}`);
  doc.moveDown();
  doc.text(`Receipts: ${pack.receipts.length}`);
  doc.text(`Proposals: ${pack.governance.proposals.length}`);
  doc.text(`Votes: ${pack.governance.votes.length}`);
  doc.text(`Timelock delay: ${pack.timelock.delay}`);
  doc.moveDown();
  doc.text(`Pack hash: ${pack.hashes.packHash}`);
  doc.end();
};

async function main() {
  if (!RPC_URL) throw new Error("RPC_URL required");
  if (!RECEIPTS_ADDRESS) throw new Error("TREASURY_RECEIPTS_ADDRESS required");
  if (!GOVERNOR_ADDRESS) throw new Error("GOVERNOR_ADDRESS required");
  if (!EXECUTOR_ADDRESS) throw new Error("PROPOSAL_EXECUTOR_ADDRESS required");

  const provider = new ghost.JsonRpcProvider(RPC_URL);
  const latest = await provider.getBlockNumber();
  const toBlock = TO_BLOCK ? Number(TO_BLOCK) : latest;
  const fromBlock = FROM_BLOCK ? Number(FROM_BLOCK) : Math.max(0, toBlock - 5000);

  const chainId = (await provider.getNetwork()).chainId;
  const toBlockData = await provider.getBlock(toBlock);
  const generatedAt = new Date(Number(toBlockData?.timestamp || 0) * 1000).toISOString();

  const receiptsAbi = [
    "event ReceiptRecorded(bytes32 indexed receiptId, bytes32 indexed actionHash, bytes32 indexed policyHash, uint256 policyVersion)",
    "function receipts(bytes32) external view returns (bytes32 receiptId, bytes32 actionHash, bytes32 policyHash, uint256 policyVersion, uint8 actionType, address asset, address target, uint256 amount, uint256 value, uint256 chainId, uint256 timestamp, address executor, bytes32 metadataHash, bytes32 aiProposalHash, uint256 aiRiskScoreBps, bytes32 treatyId)"
  ];
  const governorAbi = [
    "event ProposalCreated(uint256 indexed id, address indexed target, uint256 value, bytes data)",
    "event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight)",
    "event Queued(uint256 indexed id, uint256 eta)",
    "event Executed(uint256 indexed id)"
  ];
  const executorAbi = [
    "event Queued(uint256 indexed id, address indexed target, uint256 value, bytes data, uint256 eta)",
    "event Executed(uint256 indexed id, bytes result)",
    "function delay() external view returns (uint256)"
  ];

  const receiptsContract = new ghost.Contract(RECEIPTS_ADDRESS, receiptsAbi, provider);
  const governorContract = new ghost.Contract(GOVERNOR_ADDRESS, governorAbi, provider);
  const executorContract = new ghost.Contract(EXECUTOR_ADDRESS, executorAbi, provider);

  const receiptLogs = await receiptsContract.queryFilter("ReceiptRecorded", fromBlock, toBlock);
  const receipts = [];
  for (const log of receiptLogs) {
    const receiptId = log.args?.receiptId;
    const receipt = await receiptsContract.receipts(receiptId);
    receipts.push({
      receiptId: receipt.receiptId,
      actionHash: receipt.actionHash,
      policyHash: receipt.policyHash,
      policyVersion: receipt.policyVersion,
      actionType: receipt.actionType,
      asset: receipt.asset,
      target: receipt.target,
      amount: receipt.amount,
      value: receipt.value,
      chainId: receipt.chainId,
      timestamp: receipt.timestamp,
      executor: receipt.executor,
      metadataHash: receipt.metadataHash,
      aiProposalHash: receipt.aiProposalHash,
      aiRiskScoreBps: receipt.aiRiskScoreBps,
      treatyId: receipt.treatyId,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber
    });
  }

  const proposalLogs = await governorContract.queryFilter("ProposalCreated", fromBlock, toBlock);
  const voteLogs = await governorContract.queryFilter("Voted", fromBlock, toBlock);
  const queueLogs = await governorContract.queryFilter("Queued", fromBlock, toBlock);
  const executedLogs = await governorContract.queryFilter("Executed", fromBlock, toBlock);

  const proposals = proposalLogs.map((log) => ({
    id: log.args?.id?.toString(),
    target: log.args?.target,
    value: log.args?.value?.toString(),
    data: log.args?.data,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber
  }));

  const votes = voteLogs.map((log) => ({
    id: log.args?.id?.toString(),
    voter: log.args?.voter,
    support: log.args?.support,
    weight: log.args?.weight?.toString(),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber
  }));

  const queues = queueLogs.map((log) => ({
    id: log.args?.id?.toString(),
    eta: log.args?.eta?.toString(),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber
  }));

  const executions = executedLogs.map((log) => ({
    id: log.args?.id?.toString(),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber
  }));

  const executorDelay = await executorContract.delay();
  const executorQueueLogs = await executorContract.queryFilter("Queued", fromBlock, toBlock);
  const executorExecLogs = await executorContract.queryFilter("Executed", fromBlock, toBlock);

  const timelock = {
    executor: EXECUTOR_ADDRESS,
    delay: executorDelay.toString(),
    queued: executorQueueLogs.map((log) => ({
      id: log.args?.id?.toString(),
      target: log.args?.target,
      value: log.args?.value?.toString(),
      eta: log.args?.eta?.toString(),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber
    })),
    executed: executorExecLogs.map((log) => ({
      id: log.args?.id?.toString(),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber
    }))
  };

  const aiRationale = readOptionalJson(AI_RATIONALE_PATH);
  const aiReport = readOptionalJson(AI_REPORT_PATH);
  const ai = {
    rationale: aiRationale,
    report: aiReport,
    riskScore: aiReport?.riskScore ?? null,
    modelHash: aiReport?.modelHash ?? null,
    attestation: aiReport?.signature ?? null
  };

  const receiptLeaves = receipts.map((r) => hashOf(toSerializable(r)));
  const governanceLeaves = proposals.concat(votes, queues, executions).map((g) => hashOf(toSerializable(g)));
  const aiHash = hashOf(toSerializable(ai));

  const receiptsRoot = buildMerkleRoot(receiptLeaves);
  const governanceRoot = buildMerkleRoot(governanceLeaves);

  const pack = {
    version: "1.0",
    chainId: Number(chainId),
    fromBlock,
    toBlock,
    generatedAt,
    receipts: toSerializable(receipts),
    governance: {
      proposals: toSerializable(proposals),
      votes: toSerializable(votes),
      queues: toSerializable(queues),
      executions: toSerializable(executions)
    },
    timelock: toSerializable(timelock),
    ai: toSerializable(ai),
    hashes: {
      receiptsRoot,
      governanceRoot,
      aiHash,
      packHash: ""
    }
  };

  const packHash = hashOf(pack);
  pack.hashes.packHash = packHash;

  let signature = null;
  if (SIGNER_KEY) {
    const wallet = new ghost.Wallet(SIGNER_KEY);
    const sig = await wallet.signMessage(ghost.getBytes(packHash));
    signature = { signer: wallet.address, signature: sig };
  }

  const outputPack = { ...pack, signature };

  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "evidence_pack.json");
  const merklePath = path.join(OUTPUT_DIR, "evidence_pack.merkle");
  const sigPath = path.join(OUTPUT_DIR, "evidence_pack.sig");
  const pdfPath = path.join(OUTPUT_DIR, "evidence_pack.pdf");

  fs.writeFileSync(jsonPath, JSON.stringify(outputPack, null, 2));
  fs.writeFileSync(
    merklePath,
    JSON.stringify({ receiptsRoot, governanceRoot, aiHash, receiptLeaves, governanceLeaves }, null, 2)
  );
  fs.writeFileSync(sigPath, signature ? signature.signature : "");

  try {
    generatePdf(pdfPath, outputPack);
  } catch (err) {
    console.warn("[evidence] pdf generation failed:", err?.message || err);
  }

  console.log("[evidence] pack generated:", jsonPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
