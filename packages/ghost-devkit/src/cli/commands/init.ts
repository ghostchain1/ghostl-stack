import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logger } from "../../utils/Logger.js";
import type { CLIContext } from "../GhostCLI.js";

const log = Logger.create("init");

const GHOST_CONFIG = {
  network: "l2",
  rpc: { l1: "http://127.0.0.1:18545", l2: "http://127.0.0.1:29547", l3: "http://127.0.0.1:39545" },
  deployment: { confirmations: 1, gasMultiplier: 1.2 },
  foundry: { projectRoot: "contracts", outDir: "out", scriptDir: "script" },
  validator: { minPeers: 3, restartOnLowPeers: true },
  ghostbrainUrl: "http://127.0.0.1:8080",
};

const SAMPLE_CONTRACT = (name: string) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ${name} {
    string public name;

    constructor(string memory _name) {
        name = _name;
    }
}
`;

const SAMPLE_TEST = (name: string) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/${name}.sol";

contract ${name}Test is Test {
    ${name} public instance;

    function setUp() public {
        instance = new ${name}("Ghost");
    }

    function test_name() public {
        assertEq(instance.name(), "Ghost");
    }
}
`;

const FOUNDRY_TOML = `[profile.default]
src = "contracts"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
`;

const DEPLOY_SCRIPT = (name: string) => `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/${name}.sol";

contract Deploy${name} is Script {
    function run() public {
        vm.startBroadcast();
        new ${name}("Ghost");
        vm.stopBroadcast();
    }
}
`;

export async function run(ctx: CLIContext): Promise<void> {
  const projectName = ctx.args[1] ?? "ghost-app";
  const dest = path.resolve(process.cwd(), projectName);

  log.info(`Initialising Ghost project: ${projectName}`);

  const dirs = [
    "contracts",
    "tests",
    "scripts",
    "lib",
  ];

  for (const d of dirs) {
    await mkdir(path.join(dest, d), { recursive: true });
  }

  const contractName = projectName
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  await Promise.all([
    writeFile(path.join(dest, "ghost.config.json"), JSON.stringify(GHOST_CONFIG, null, 2)),
    writeFile(path.join(dest, "foundry.toml"), FOUNDRY_TOML),
    writeFile(path.join(dest, `contracts/${contractName}.sol`), SAMPLE_CONTRACT(contractName)),
    writeFile(path.join(dest, `tests/${contractName}.t.sol`), SAMPLE_TEST(contractName)),
    writeFile(path.join(dest, `scripts/Deploy${contractName}.s.sol`), DEPLOY_SCRIPT(contractName)),
    writeFile(path.join(dest, ".gitignore"), "out/\ncache/\nnode_modules/\n.env\n"),
  ]);

  log.info(`Project created at: ${dest}`);
  console.log(`\n  cd ${projectName}`);
  console.log("  ghost build");
  console.log("  ghost test");
  console.log("  ghost deploy --network l2\n");
}
