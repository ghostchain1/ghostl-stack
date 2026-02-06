// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import { GhostGasTokenL2, GhostGasTokenL3 } from "../src/GhostGasTokens.sol";
import { GhostTokenL2 } from "../src/GhostTokenL2.sol";

contract GSTInvariantTest is Test {
    address internal constant CANONICAL_GAS_TOKEN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;

    function test_native_token_metadata_locked() external {
        vm.startPrank(CANONICAL_GAS_TOKEN);

        GhostGasTokenL2 l2 = new GhostGasTokenL2(0);
        GhostGasTokenL3 l3 = new GhostGasTokenL3(0);
        GhostTokenL2 legacyL2 = new GhostTokenL2();

        vm.stopPrank();

        assertEq(l2.decimals(), 18);
        assertEq(l3.decimals(), 18);
        assertEq(legacyL2.decimals(), 18);

        assertEq(l2.symbol(), "GHOST");
        assertEq(l3.symbol(), "GHOST");
        assertEq(legacyL2.symbol(), "GHOST");

        assertEq(l2.name(), "Ghost Token");
        assertEq(l3.name(), "Ghost Token");
        assertEq(legacyL2.name(), "Ghost Token");
    }

    function test_no_forbidden_branding_in_frontdoor_configs() external view {
        // Intentionally keep this file list small to avoid scanning large generated artifacts.
        string[4] memory paths = [
            // Scan the tracked template rather than the local secret env file.
            string("../services/stack.env.example"),
            string("../package.json"),
            string("../infra/docker/compose/stack.env"),
            string("../docs/architecture/phase3-containers.md")
        ];

        bytes memory eth = bytes(string.concat("E", "TH"));
        bytes memory legacyUnit = bytes(string.concat("Et", "her"));
        bytes memory legacyChain = bytes(string.concat("Ethere", "um"));
        bytes memory xi = hex"ce9e";

        for (uint256 i = 0; i < paths.length; i++) {
            string memory content = vm.readFile(paths[i]);
            bytes memory raw = bytes(content);

            require(!_containsWord(raw, eth), "forbidden:legacy_symbol");
            require(!_containsWord(raw, legacyUnit), "forbidden:legacy_unit");
            require(!_containsWord(raw, legacyChain), "forbidden:legacy_chain");
            require(!_contains(raw, xi), "forbidden:legacy_glyph");
        }
    }

    function _contains(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        if (needle.length == 0 || haystack.length < needle.length) return false;
        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    function _containsWord(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        if (needle.length == 0 || haystack.length < needle.length) return false;
        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
            bytes1 beforeCh = i == 0 ? bytes1(0) : haystack[i - 1];
            bytes1 afterCh = (i + needle.length) >= haystack.length ? bytes1(0) : haystack[i + needle.length];
            if (_isWordChar(beforeCh) || _isWordChar(afterCh)) {
                continue;
            }
            return true;
        }
        return false;
    }

    function _isWordChar(bytes1 ch) internal pure returns (bool) {
        uint8 c = uint8(ch);
        if (c >= 48 && c <= 57) return true; // 0-9
        if (c >= 65 && c <= 90) return true; // A-Z
        if (c >= 97 && c <= 122) return true; // a-z
        if (c == 95) return true; // _
        return false;
    }
}
