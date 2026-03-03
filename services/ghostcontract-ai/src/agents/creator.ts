/**
 * GhostContractAI — Creator Agent (CONTRACT_CREATE)
 *
 * Renders a new Solidity contract from a template, writes it to the
 * allowed root, then compiles and audits it.
 *
 * Templates live in src/agents/templates/*.sol.hbs (Handlebars-lite substitution).
 * Only simple {{KEY}} substitution is supported to avoid template injection risks.
 */

import * as path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Job, Plan, JobResult, CreatedContract } from "../types/jobs.js";
import type { WorkspaceState } from "../types/jobs.js";
import { forgeBuild, forgeTest, withForgeSemaphore } from "../tools/foundry.js";
import { runSlither } from "../tools/slither.js";
import { writeAllowedFile } from "../tools/fs_stream.js";
import { gitDiff } from "../tools/git.js";
import { CONTRACTS_DIR } from "../config.js";
import { getRemainingMs, resolveContractPath } from "../core/workspace.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

// ─── Built-in templates ───────────────────────────────────────────────────────

const BUILTIN_TEMPLATES: Record<string, string> = {
  erc20: `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title {{CONTRACT_NAME}}
/// @notice {{DESCRIPTION}}
contract {{CONTRACT_NAME}} is ERC20, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
`,

  erc721: `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title {{CONTRACT_NAME}}
/// @notice {{DESCRIPTION}}
contract {{CONTRACT_NAME}} is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor(address initialOwner)
        ERC721("{{CONTRACT_NAME}}", "{{SYMBOL}}")
        Ownable(initialOwner)
    {}

    function safeMint(address to) public onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }
}
`,

  uups_proxy: `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title {{CONTRACT_NAME}}
/// @notice {{DESCRIPTION}}
/// @custom:oz-upgrades-from {{PREVIOUS_CONTRACT}}
contract {{CONTRACT_NAME}} is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
`,

  treasury: `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title {{CONTRACT_NAME}}
/// @notice {{DESCRIPTION}}
contract {{CONTRACT_NAME}} is AccessControl, ReentrancyGuard {
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    event Withdrawn(address indexed to, uint256 amount);
    event Received(address indexed from, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount)
        external
        onlyRole(SPENDER_ROLE)
        nonReentrant
    {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(to, amount);
    }
}
`,
};

// ─── Agent ────────────────────────────────────────────────────────────────────

export async function runCreator(
  job: Job,
  ws: WorkspaceState,
  _plan: Plan,
): Promise<JobResult> {
  logger.info("Creator agent: starting", { jobId: job.id });

  const templateId = job.context.templateId ?? "erc20";
  const params = job.context.templateParams ?? {};
  const contractName = params["CONTRACT_NAME"] ?? "MyContract";
  const targetRelPath =
    job.context.targetPath ?? `src/${contractName}.sol`;
  const targetPath = resolveContractPath(targetRelPath);

  // 1. Render template
  const source = _renderTemplate(templateId, params);
  if (!source) {
    return {
      success: false,
      summary: `Creator: unknown template "${templateId}"`,
    };
  }

  // 2. Write file
  const sha256After = await writeAllowedFile(
    targetPath,
    source,
    ws.allowedRoots,
  );

  // Note: sha256After recorded in evidence touchedFiles by orchestrator
  void sha256After;

  // 3. Compile
  const remaining = getRemainingMs(ws);
  const buildResult = await withForgeSemaphore(() =>
    forgeBuild(CONTRACTS_DIR, Math.min(remaining, 300_000)),
  );
  const buildPassed = buildResult.code === 0;

  // 4. Test (if not dry-run)
  let testPassed: boolean | undefined;
  if (!job.constraints.dryRun) {
    const testResult = await withForgeSemaphore(() =>
      forgeTest(CONTRACTS_DIR, Math.min(getRemainingMs(ws), 300_000)),
    );
    testPassed = testResult.code === 0;
  }

  // 5. Slither
  const slither = await runSlither(
    targetPath,
    CONTRACTS_DIR,
    Math.min(getRemainingMs(ws), 120_000),
  );

  // 6. Generate diff
  const diff = await gitDiff(
    path.dirname(CONTRACTS_DIR),
    [targetPath],
    job.constraints.maxPatchBytes ?? 2_097_152,
  );

  const created: CreatedContract = {
    templateId,
    contractName,
    targetPath,
    patchDiff: diff.diff,
  };

  const success =
    buildPassed &&
    slither.highFindings === 0 &&
    testPassed !== false;

  logger.info("Creator agent: done", {
    jobId: job.id,
    success,
    buildPassed,
    testPassed,
    slitherHigh: slither.highFindings,
  });

  return {
    success,
    summary: success
      ? `Created ${contractName} at ${targetPath}`
      : `Creator partially failed — buildPassed=${buildPassed}, slitherHigh=${slither.highFindings}`,
    buildPassed,
    ...(testPassed !== undefined && { testPassed }),
    slitherHighFindings: slither.highFindings,
    patchDiff: diff.diff,
    createdContract: created,
    artifacts: {
      compileLogs: (buildResult.stdout + buildResult.stderr).slice(0, 32_768),
      auditLogs: slither.rawOutput.slice(0, 32_768),
    },
  };
}

// ─── Template renderer ────────────────────────────────────────────────────────

function _renderTemplate(
  templateId: string,
  params: Record<string, string>,
): string | null {
  // Try file-system templates first (allows user extension)
  const fsPath = path.join(TEMPLATES_DIR, `${templateId}.sol`);
  let tmpl: string;

  if (existsSync(fsPath)) {
    tmpl = readFileSync(fsPath, "utf8");
  } else if (BUILTIN_TEMPLATES[templateId]) {
    tmpl = BUILTIN_TEMPLATES[templateId];
  } else {
    return null;
  }

  // Simple {{KEY}} substitution — no Handlebars, to prevent template injection
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => params[key] ?? `{{${key}}}`);
}
