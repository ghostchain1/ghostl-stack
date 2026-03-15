/**
 * Smart Contract Builder — generates Solidity contracts for GhostChain ecosystems.
 */

import { v4 as uuid } from "uuid";
import logger from "../utils/logger";

export type ContractType    = "staking" | "defi-pool" | "governance" | "nft-marketplace" | "token" | "bridge" | "vesting";
export type ContractNetwork = "GhostChain" | "GhostL2" | "GhostL3";
export type AuditStatus     = "pending" | "clean" | "issues-found" | "blocked";

export interface BuiltContract {
  id:          string;
  name:        string;
  type:        ContractType;
  network:     ContractNetwork;
  solidity:    string;   // compiler version
  content:     string;
  bytecodeSize:number;   // bytes
  functions:   number;
  auditStatus: AuditStatus;
  deployedAt?: number;
  address?:    string;
  verified:    boolean;
  builtAt:     number;
}

const MAX_CONTRACTS = 100;
const store: BuiltContract[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function ghostAddr(): string { return "0x" + Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""); }

const TEMPLATES: Record<ContractType, (name: string, network: ContractNetwork) => string> = {
  staking: (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
// Ghost Autonomous Development Engine

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is ReentrancyGuard, Ownable {
    IERC20 public immutable gst;
    uint256 public constant MIN_STAKE  = 100 ether;
    uint256 public constant LOCK_PERIOD = 14 days;
    uint256 public totalStaked;
    uint256 public rewardRate;  // per block in wei

    struct Stake {
        uint256 amount;
        uint256 stakedAt;
        uint256 rewardDebt;
        bool    active;
    }

    mapping(address => Stake) public stakes;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount, uint256 reward);
    event RewardRateUpdated(uint256 newRate);

    constructor(address _gst, uint256 _rewardRate) Ownable(msg.sender) {
        gst        = IERC20(_gst);
        rewardRate = _rewardRate;
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount >= MIN_STAKE, "${name}: below minimum stake");
        require(!stakes[msg.sender].active, "${name}: already staking");
        gst.transferFrom(msg.sender, address(this), amount);
        stakes[msg.sender] = Stake(amount, block.timestamp, block.number, true);
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.active, "${name}: no active stake");
        require(block.timestamp >= s.stakedAt + LOCK_PERIOD, "${name}: lock period");
        uint256 reward  = (block.number - s.rewardDebt) * rewardRate;
        uint256 payout  = s.amount + reward;
        s.active        = false;
        totalStaked    -= s.amount;
        gst.transfer(msg.sender, payout);
        emit Unstaked(msg.sender, s.amount, reward);
    }

    function setRewardRate(uint256 rate) external onlyOwner {
        rewardRate = rate;
        emit RewardRateUpdated(rate);
    }

    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
}`,

  "defi-pool": (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ${name} is ReentrancyGuard {
    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public totalLPTokens;
    mapping(address => uint256) public lpBalance;

    uint256 private constant FEE_BPS = 30; // 0.30%

    event LiquidityAdded(address indexed provider, uint256 amtA, uint256 amtB, uint256 lpMinted);
    event Swapped(address indexed trader, address tokenIn, uint256 amtIn, uint256 amtOut);

    constructor(address _a, address _b) { tokenA = IERC20(_a); tokenB = IERC20(_b); }

    function addLiquidity(uint256 amtA, uint256 amtB) external nonReentrant returns (uint256 lp) {
        tokenA.transferFrom(msg.sender, address(this), amtA);
        tokenB.transferFrom(msg.sender, address(this), amtB);
        lp = totalLPTokens == 0 ? sqrt(amtA * amtB) : min(amtA * totalLPTokens / reserveA, amtB * totalLPTokens / reserveB);
        reserveA += amtA; reserveB += amtB; totalLPTokens += lp; lpBalance[msg.sender] += lp;
        emit LiquidityAdded(msg.sender, amtA, amtB, lp);
    }

    function swapAForB(uint256 amtIn) external nonReentrant returns (uint256 amtOut) {
        tokenA.transferFrom(msg.sender, address(this), amtIn);
        uint256 amtInFee = amtIn * (10000 - FEE_BPS) / 10000;
        amtOut = (amtInFee * reserveB) / (reserveA + amtInFee);
        reserveA += amtIn; reserveB -= amtOut;
        tokenB.transfer(msg.sender, amtOut);
        emit Swapped(msg.sender, address(tokenA), amtIn, amtOut);
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) { if (y > 3) { z = y; uint256 x = y / 2 + 1; while (x < z) { z = x; x = (y / x + x) / 2; } } else if (y != 0) { z = 1; } }
    function min(uint256 a, uint256 b) internal pure returns (uint256) { return a < b ? a : b; }
    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
}`,

  governance: (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is Ownable {
    struct Proposal { uint256 id; string description; uint256 forVotes; uint256 againstVotes; uint256 deadline; bool executed; }
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => mapping(uint256 => bool)) public hasVoted;
    uint256 public quorum = 100 ether;

    event ProposalCreated(uint256 id, string description, uint256 deadline);
    event Voted(uint256 id, address voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 id, bool passed);

    constructor() Ownable(msg.sender) {}

    function createProposal(string calldata desc, uint256 duration) external onlyOwner returns (uint256 id) {
        id = ++proposalCount;
        proposals[id] = Proposal(id, desc, 0, 0, block.timestamp + duration, false);
        emit ProposalCreated(id, desc, block.timestamp + duration);
    }

    function vote(uint256 id, bool support, uint256 weight) external {
        Proposal storage p = proposals[id];
        require(block.timestamp <= p.deadline, "${name}: voting closed");
        require(!hasVoted[msg.sender][id], "${name}: already voted");
        hasVoted[msg.sender][id] = true;
        if (support) p.forVotes += weight; else p.againstVotes += weight;
        emit Voted(id, msg.sender, support, weight);
    }

    function execute(uint256 id) external onlyOwner {
        Proposal storage p = proposals[id];
        require(block.timestamp > p.deadline && !p.executed, "${name}: not ready");
        require(p.forVotes + p.againstVotes >= quorum, "${name}: quorum");
        p.executed = true;
        emit ProposalExecuted(id, p.forVotes > p.againstVotes);
    }

    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
}`,

  "nft-marketplace": (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ${name} is ReentrancyGuard {
    struct Listing { address seller; uint256 price; bool active; }
    mapping(address => mapping(uint256 => Listing)) public listings;
    uint256 public feeBps = 250; // 2.5%
    address payable public treasury;

    event Listed(address nft, uint256 tokenId, address seller, uint256 price);
    event Sold(address nft, uint256 tokenId, address buyer, uint256 price);
    event Delisted(address nft, uint256 tokenId);

    constructor(address payable _treasury) { treasury = _treasury; }

    function list(address nft, uint256 tokenId, uint256 price) external {
        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);
        listings[nft][tokenId] = Listing(msg.sender, price, true);
        emit Listed(nft, tokenId, msg.sender, price);
    }

    function buy(address nft, uint256 tokenId) external payable nonReentrant {
        Listing storage l = listings[nft][tokenId];
        require(l.active && msg.value >= l.price, "${name}: bad payment");
        uint256 fee = l.price * feeBps / 10000;
        l.active = false;
        treasury.transfer(fee);
        payable(l.seller).transfer(l.price - fee);
        IERC721(nft).transferFrom(address(this), msg.sender, tokenId);
        emit Sold(nft, tokenId, msg.sender, l.price);
    }

    function delist(address nft, uint256 tokenId) external nonReentrant {
        Listing storage l = listings[nft][tokenId];
        require(msg.sender == l.seller && l.active, "${name}: not seller");
        l.active = false;
        IERC721(nft).transferFrom(address(this), msg.sender, tokenId);
        emit Delisted(nft, tokenId);
    }

    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
}`,

  token: (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;
    mapping(address => bool) public blacklisted;

    event Blacklisted(address account, bool status);

    constructor(uint256 initialSupply) ERC20("${name}", "${name.slice(0, 4).toUpperCase()}") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amt) external onlyOwner {
        require(totalSupply() + amt <= MAX_SUPPLY, "${name}: exceeds max supply");
        _mint(to, amt);
    }

    function burn(uint256 amt) external { _burn(msg.sender, amt); }
    function setBlacklist(address account, bool status) external onlyOwner { blacklisted[account] = status; emit Blacklisted(account, status); }
    function _update(address from, address to, uint256 val) internal override { require(!blacklisted[from] && !blacklisted[to], "${name}: blacklisted"); super._update(from, to, val); }
    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
}`,

  bridge: (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ${name} is Ownable, ReentrancyGuard {
    mapping(bytes32 => bool) public processedNonces;
    mapping(address => bool) public validators;
    uint256 public requiredSignatures = 3;
    uint256 public bridgeFeesBps = 10;

    event BridgeOut(address indexed from, uint256 amount, uint256 destChainId, bytes32 nonce);
    event BridgeIn(address indexed to, uint256 amount, bytes32 nonce);
    event ValidatorUpdated(address validator, bool active);

    constructor() Ownable(msg.sender) {}

    function bridgeOut(uint256 amount, uint256 destChainId) external payable nonReentrant {
        require(msg.value == amount, "${name}: value mismatch");
        bytes32 nonce = keccak256(abi.encodePacked(msg.sender, amount, destChainId, block.timestamp));
        uint256 fee   = amount * bridgeFeesBps / 10000;
        payable(owner()).transfer(fee);
        emit BridgeOut(msg.sender, amount - fee, destChainId, nonce);
    }

    function bridgeIn(address to, uint256 amount, bytes32 nonce) external onlyOwner nonReentrant {
        require(!processedNonces[nonce], "${name}: already processed");
        processedNonces[nonce] = true;
        payable(to).transfer(amount);
        emit BridgeIn(to, amount, nonce);
    }

    function setValidator(address v, bool active) external onlyOwner { validators[v] = active; emit ValidatorUpdated(v, active); }
    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
    receive() external payable {}
}`,

  vesting: (name, network) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// AI-Generated ${name} — ${network}
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ${name} is Ownable {
    IERC20 public immutable gst;
    struct Schedule { uint256 total; uint256 released; uint256 start; uint256 cliff; uint256 duration; bool revoked; }
    mapping(address => Schedule) public schedules;

    event ScheduleCreated(address beneficiary, uint256 total, uint256 cliff, uint256 duration);
    event Released(address beneficiary, uint256 amount);
    event Revoked(address beneficiary, uint256 returned);

    constructor(address _gst) Ownable(msg.sender) { gst = IERC20(_gst); }

    function createSchedule(address ben, uint256 total, uint256 cliff, uint256 duration) external onlyOwner {
        require(schedules[ben].total == 0, "${name}: exists");
        gst.transferFrom(msg.sender, address(this), total);
        schedules[ben] = Schedule(total, 0, block.timestamp, cliff, duration, false);
        emit ScheduleCreated(ben, total, cliff, duration);
    }

    function release() external {
        Schedule storage s = schedules[msg.sender];
        require(!s.revoked && block.timestamp >= s.start + s.cliff, "${name}: cliff");
        uint256 vested  = s.total * min(block.timestamp - s.start, s.duration) / s.duration;
        uint256 claimable = vested - s.released;
        require(claimable > 0, "${name}: nothing");
        s.released += claimable;
        gst.transfer(msg.sender, claimable);
        emit Released(msg.sender, claimable);
    }

    function revoke(address ben) external onlyOwner {
        Schedule storage s = schedules[ben];
        require(!s.revoked, "${name}: already revoked");
        uint256 refund = s.total - s.released;
        s.revoked = true;
        gst.transfer(owner(), refund);
        emit Revoked(ben, refund);
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) { return a < b ? a : b; }
    function version() public pure returns (string memory) { return "ADE-${name}-v1.0"; }
}`,
};

const CONTRACT_NAMES: Record<ContractType, string[]> = {
  staking:           ["GhostStaking", "ValidatorVault", "GSTStakePool", "LiquidStaking"],
  "defi-pool":       ["GhostSwapPool", "GSTUSDCPool", "WGSTETHPool", "GhostYield"],
  governance:        ["GhostDAO", "GhostGov", "CommunityVote", "EcosystemDelegate"],
  "nft-marketplace": ["GhostMarket", "GhostNFTX", "GhostTrade", "GhostAuction"],
  token:             ["GhostToken", "wGST", "GhostLP", "GhostReward"],
  bridge:            ["GhostBridge", "L2Bridge", "L3Bridge", "CrossChainGST"],
  vesting:           ["TeamVesting", "InvestorVesting", "GrantVesting", "AdvisorVesting"],
};

function seed() {
  const types: ContractType[] = ["staking", "defi-pool", "governance", "nft-marketplace", "bridge", "vesting"];
  const networks: ContractNetwork[] = ["GhostChain", "GhostL2", "GhostL3"];
  for (let i = 0; i < 8; i++) {
    const type    = pick(types);
    const network = pick(networks);
    const name    = pick(CONTRACT_NAMES[type]);
    const deployed = Math.random() < 0.65;
    const hoursAgo = rand(2, 240);
    const contract: BuiltContract = {
      id:           uuid(),
      name,
      type,
      network,
      solidity:     "0.8.24",
      content:      TEMPLATES[type](name, network),
      bytecodeSize: rand(2400, 28_000),
      functions:    rand(4, 14),
      auditStatus:  deployed ? "clean" : pick(["pending", "clean"] as AuditStatus[]),
      builtAt:      Date.now() - hoursAgo * 3_600_000,
      ...(deployed ? { deployedAt: Date.now() - (hoursAgo - rand(1, 6)) * 3_600_000, address: ghostAddr(), verified: Math.random() < 0.8 } : { verified: false }),
    };
    store.push(contract);
  }
  logger.info(`[ContractBuilder] Seeded ${store.length} contracts`);
}

export function buildContract(name?: string, type?: ContractType, network?: ContractNetwork): BuiltContract {
  const ctype   = type    ?? pick(["staking", "defi-pool", "governance", "nft-marketplace", "token", "bridge", "vesting"] as ContractType[]);
  const cnet    = network ?? pick(["GhostChain", "GhostL2", "GhostL3"] as ContractNetwork[]);
  const cname   = name    ?? pick(CONTRACT_NAMES[ctype]);
  const contract: BuiltContract = {
    id:           uuid(),
    name:         cname,
    type:         ctype,
    network:      cnet,
    solidity:     "0.8.24",
    content:      TEMPLATES[ctype](cname, cnet),
    bytecodeSize: rand(2400, 28_000),
    functions:    rand(4, 14),
    auditStatus:  "pending",
    builtAt:      Date.now(),
    verified:     false,
  };
  store.unshift(contract);
  if (store.length > MAX_CONTRACTS) store.pop();
  logger.info(`[ContractBuilder] Built ${ctype} contract: ${cname} → ${cnet}`);
  return contract;
}

export function getContracts(opts: {
  type?: ContractType; network?: ContractNetwork; auditStatus?: AuditStatus; limit?: number;
} = {}): BuiltContract[] {
  let list = [...store];
  if (opts.type)        list = list.filter(c => c.type        === opts.type);
  if (opts.network)     list = list.filter(c => c.network     === opts.network);
  if (opts.auditStatus) list = list.filter(c => c.auditStatus === opts.auditStatus);
  return list.slice(0, opts.limit ?? 50);
}

export function getContractById(id: string): BuiltContract | undefined {
  return store.find(c => c.id === id);
}

export function updateContractAudit(id: string, status: AuditStatus): boolean {
  const c = store.find(c => c.id === id);
  if (!c) return false;
  c.auditStatus = status;
  return true;
}

export function updateContractDeployment(id: string, address: string): boolean {
  const c = store.find(c => c.id === id);
  if (!c) return false;
  c.address    = address;
  c.deployedAt = Date.now();
  c.verified   = false;
  return true;
}

export function getContractStats() {
  return {
    total:     store.length,
    deployed:  store.filter(c => !!c.address).length,
    audited:   store.filter(c => c.auditStatus === "clean").length,
    pending:   store.filter(c => c.auditStatus === "pending").length,
    blocked:   store.filter(c => c.auditStatus === "blocked").length,
    byNetwork: Object.fromEntries((["GhostChain","GhostL2","GhostL3"] as ContractNetwork[]).map(n => [n, store.filter(c => c.network === n).length])),
    byType:    Object.fromEntries((["staking","defi-pool","governance","nft-marketplace","token","bridge","vesting"] as ContractType[]).map(t => [t, store.filter(c => c.type === t).length])),
  };
}

seed();
