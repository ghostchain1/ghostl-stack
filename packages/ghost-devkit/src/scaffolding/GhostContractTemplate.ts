export class GhostContractTemplate {
  /** Solidity source for a minimal ownable contract. */
  generate(name: string): string {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${name} {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "${name}: not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "${name}: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
`;
  }

  /** Foundry test template. */
  generateTest(name: string): string {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ${name} } from "../src/${name}.sol";

contract ${name}Test is Test {
    ${name} private instance;

    function setUp() public {
        instance = new ${name}();
    }

    function test_Owner() public view {
        assertEq(instance.owner(), address(this));
    }

    function test_TransferOwnership() public {
        address newOwner = address(0xBEEF);
        instance.transferOwnership(newOwner);
        assertEq(instance.owner(), newOwner);
    }

    function test_RevertIfNotOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        instance.transferOwnership(address(0xBEEF));
    }
}
`;
  }

  /** Foundry broadcast script template. */
  generateScript(name: string): string {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { ${name} } from "../src/${name}.sol";

contract Deploy${name} is Script {
    function run() external {
        vm.startBroadcast();
        new ${name}();
        vm.stopBroadcast();
    }
}
`;
  }

  static readonly GITIGNORE = `# Foundry artifacts
contracts/out/
contracts/cache/

# Node
node_modules/
dist/

# Secrets
.env
*.env
private_key.txt
`;
}
