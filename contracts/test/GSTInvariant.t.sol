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

        assertEq(l2.symbol(), "GST");
        assertEq(l3.symbol(), "GST");
        assertEq(legacyL2.symbol(), "GST");

        assertEq(l2.name(), "Ghost");
        assertEq(l3.name(), "Ghost");
        assertEq(legacyL2.name(), "Ghost");
    }

    function test_no_forbidden_branding_in_frontdoor_configs() external view {
        // Keep this list bounded and focused on L1/L2/L3 config surfaces + bridge/gas-token labeling.
        string[] memory paths = new string[](10);
        // Scan tracked templates/configs instead of local secret env files.
        paths[0] = "../services/stack.env.example";
        paths[1] = "../package.json";
        paths[2] = "../infra/docker/compose/stack.env";
        paths[3] = "../docs/architecture/custom-ghost-multichain.md";
        paths[4] = "../infra/ghostchain/docker-compose.l1.yml";
        paths[5] = "../chains/ghostl2/chain.json";
        paths[6] = "../chains/ghostl3/chain.json";
        paths[7] = "../environments/devnet/ghostl2.env.example";
        paths[8] = "../environments/devnet/ghostl3.env.example";
        paths[9] = "../apps/web/src/modules/chain/components/ChainLayerDashboard.tsx";

        bytes memory legacySymbol = abi.encodePacked(bytes1(uint8(69)), bytes1(uint8(84)), bytes1(uint8(72)));
        bytes memory legacyUnit = abi.encodePacked(
            bytes1(uint8(69)),
            bytes1(uint8(116)),
            bytes1(uint8(104)),
            bytes1(uint8(101)),
            bytes1(uint8(114))
        );
        bytes memory legacyChain = abi.encodePacked(
            bytes1(uint8(69)),
            bytes1(uint8(116)),
            bytes1(uint8(104)),
            bytes1(uint8(101)),
            bytes1(uint8(114)),
            bytes1(uint8(101)),
            bytes1(uint8(117)),
            bytes1(uint8(109))
        );
        bytes memory xi = hex"ce9e";
        bytes memory legacyRpcKey = abi.encodePacked(legacySymbol, bytes("_RPC"));
        bytes memory legacyChainIdKey = abi.encodePacked(legacySymbol, bytes("_CHAIN_ID"));
        bytes memory legacyPrivateKey = abi.encodePacked(legacySymbol, bytes("_PRIVATE_KEY"));
        bytes memory legacyExplorerKey = abi.encodePacked(bytes("ETHER"), bytes("SCAN"));
        bytes memory legacyNativeKey = abi.encodePacked(
            bytes("native"),
            bytes1(uint8(69)),
            bytes1(uint8(116)),
            bytes1(uint8(104))
        );
        bytes memory legacyAmountKey = abi.encodePacked(
            bytes1(uint8(101)),
            bytes1(uint8(116)),
            bytes1(uint8(104)),
            bytes("Amount")
        );
        bytes memory legacyBalanceKey = abi.encodePacked(
            bytes1(uint8(101)),
            bytes1(uint8(116)),
            bytes1(uint8(104)),
            bytes("Balance")
        );
        bytes memory legacySuffixKey = abi.encodePacked(bytes("_"), bytes1(uint8(101)), bytes1(uint8(116)), bytes1(uint8(104)));

        for (uint256 i = 0; i < paths.length; i++) {
            string memory content = vm.readFile(paths[i]);
            bytes memory raw = bytes(content);

            require(!_containsWord(raw, legacySymbol), "forbidden:legacy_symbol");
            require(!_containsWord(raw, legacyUnit), "forbidden:legacy_unit");
            require(!_containsWord(raw, legacyChain), "forbidden:legacy_chain");
            require(!_contains(raw, xi), "forbidden:legacy_glyph");
            require(!_contains(raw, legacyRpcKey), "forbidden:legacy_rpc_key");
            require(!_contains(raw, legacyChainIdKey), "forbidden:legacy_chain_id_key");
            require(!_contains(raw, legacyPrivateKey), "forbidden:legacy_private_key");
            require(!_contains(raw, legacyExplorerKey), "forbidden:legacy_explorer_key");
            require(!_contains(raw, legacyNativeKey), "forbidden:legacy_native_identifier");
            require(!_contains(raw, legacyAmountKey), "forbidden:legacy_amount_identifier");
            require(!_contains(raw, legacyBalanceKey), "forbidden:legacy_balance_identifier");
            require(!_contains(raw, legacySuffixKey), "forbidden:legacy_suffix_identifier");
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
