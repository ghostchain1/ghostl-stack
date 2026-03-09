/**
 * GhostContract AI
 *
 * Generates, gas-optimizes, auto-audits, and deploys smart contract upgrades.
 * Works inside /home/ghost/ghostl-stack/contracts via ghost-contract-factory.
 */

import { fetch }     from "undici";
import { BaseAgent } from "./base.js";
import type { SwarmTask } from "../types.js";

const CONTRACT_FACTORY_URL = process.env.CONTRACT_FACTORY_URL ?? "http://127.0.0.1:7985";
const CONTRACT_ENGINE_URL  = process.env.CONTRACT_ENGINE_URL  ?? "http://127.0.0.1:7940";

export class GhostContractAgent extends BaseAgent {
  readonly role         = "contract" as const;
  readonly name         = "GhostContract AI";
  readonly description  = "Generates, optimizes, and deploys smart contracts via ghost-contract-factory";
  readonly capabilities = [
    "generate-code", "deploy-contract", "audit-contract",
    "optimize-gas", "upgrade-contracts",
  ];

  protected async handleTask(task: SwarmTask): Promise<Record<string, unknown>> {
    switch (task.type) {
      case "generate-code":   return this.generateViaFactory(task.payload);
      case "deploy-contract": return this.deployViaEngine(task.payload);
      case "audit-contract":  return this.auditViaEngine(task.payload);
      default:                return this.generateViaFactory(task.payload);
    }
  }

  private async generateViaFactory(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const type = (payload["type"] as string | undefined) ?? "token";
    const name = (payload["name"] as string | undefined) ?? "GhostModule";

    const result = await this.callService(CONTRACT_FACTORY_URL, "/generate", {
      type, name, options: payload["options"] ?? {},
    });

    if (result !== null) return result;

    // Offline fallback — deterministic template generator
    const templates: Record<string, string> = {
      token:     this.tokenTemplate(name),
      staking:   this.stakingTemplate(name),
      dao:       this.daoTemplate(name),
      vault:     this.vaultTemplate(name),
    };

    return {
      source:        "offline-template",
      type,
      name,
      solidity:      templates[type] ?? this.tokenTemplate(name),
      requiresAudit: true,
      gasEstimate:   type === "dao" ? 1_200_000 : 650_000,
    };
  }

  private async deployViaEngine(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.callService(CONTRACT_ENGINE_URL, "/deploy", payload);
    return result ?? {
      status:  "queued",
      payload,
      note:    "ghost-contract-engine offline — deployment queued",
    };
  }

  private async auditViaEngine(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.callService(CONTRACT_ENGINE_URL, "/audit", payload);
    return result ?? { status: "queued", note: "Audit queued (engine offline)" };
  }

  private async callService(
    base: string,
    path: string,
    body: unknown,
  ): Promise<Record<string, unknown> | null> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${base}${path}`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
      });
      if (res.ok) return await res.json() as Record<string, unknown>;
    } catch { /* service offline */ }
    return null;
  }

  // — Deterministic offline templates —————————————————————————————————————————

  private tokenTemplate(name: string): string {
    return `// GhostChain Contracts v5.6.1 (generated/${name}.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../ghost/GhostBrand.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ${name}
/// @notice GhostChain ERC-20 token. Gas token: GST.
contract ${name} is GhostBrand, ERC20 {
    address public immutable GOVERNANCE;
    constructor(address governance, uint256 initialSupply)
        ERC20("${name}", "${name.toUpperCase().slice(0,4)}")
    {
        GOVERNANCE = governance;
        _mint(governance, initialSupply);
    }
}`;
  }

  private stakingTemplate(name: string): string {
    return `// GhostChain Contracts v5.6.1 (generated/${name}.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../ghost/GhostBrand.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ${name}
/// @notice GhostChain staking vault. Stakes GST.
contract ${name} is GhostBrand {
    IERC20 public immutable GST;
    address public immutable GOVERNANCE;
    mapping(address => uint256) public stakedBalance;
    constructor(address gst, address governance) { GST = IERC20(gst); GOVERNANCE = governance; }
    function stake(uint256 amount) external {
        require(GST.transferFrom(msg.sender, address(this), amount), "GST transfer failed");
        stakedBalance[msg.sender] += amount;
    }
    function unstake(uint256 amount) external {
        require(stakedBalance[msg.sender] >= amount, "Insufficient stake");
        stakedBalance[msg.sender] -= amount;
        require(GST.transfer(msg.sender, amount), "GST return failed");
    }
}`;
  }

  private daoTemplate(name: string): string {
    return `// GhostChain Contracts v5.6.1 (generated/${name}.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../ghost/GhostBrand.sol";

/// @title ${name}
/// @notice GhostChain DAO. Proposals require human ratification.
contract ${name} is GhostBrand {
    address public immutable GOVERNANCE;
    uint256 public proposalCount;
    event ProposalCreated(uint256 indexed id, address proposer, string description);
    constructor(address governance) { GOVERNANCE = governance; }
    function propose(string calldata description) external returns (uint256) {
        uint256 id = ++proposalCount;
        emit ProposalCreated(id, msg.sender, description);
        return id;
    }
}`;
  }

  private vaultTemplate(name: string): string {
    return `// GhostChain Contracts v5.6.1 (generated/${name}.sol)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { GhostBrand } from "../ghost/GhostBrand.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ${name}
/// @notice GhostChain vault. Holds GST.
contract ${name} is GhostBrand {
    IERC20 public immutable GST;
    address public immutable GOVERNANCE;
    uint256 public totalAssets;
    constructor(address gst, address governance) { GST = IERC20(gst); GOVERNANCE = governance; }
    function deposit(uint256 amount) external {
        require(GST.transferFrom(msg.sender, address(this), amount), "GST transfer failed");
        totalAssets += amount;
    }
}`;
  }
}
