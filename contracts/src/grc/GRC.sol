// SPDX-License-Identifier: MIT
// GhostChain Contracts v5.6.1 (grc/GRC.sol)
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.io

pragma solidity ^0.8.24;

/*
    GhostChain Standard Registry — GRC
    ===================================

    GRC replaces ERC (Ethereum Request for Comments) with
    GRC (Ghost Request for Comments), enforcing GhostChain
    protocol identity while maintaining full ABI compatibility
    with existing tooling.

    Mapping:
      ERC20   → GRC20   (contracts/src/ghost/GRC20.sol)
      ERC721  → GRC721  (contracts/src/ghost/GRC721.sol)
      ERC1155 → GRC1155 (contracts/src/ghost/GRC1155.sol)
      ERC165  → GRC165  (contracts/src/grc/GRC165.sol)
      ERC2612 → GRC2612 (contracts/src/grc/GRC2612.sol)
      ERC2981 → GRC2981 (contracts/src/grc/GRC2981.sol)
      ERC4626 → GRC4626 (contracts/src/grc/GRC4626.sol)

    All standards are ABI-identical to their Ethereum equivalents.
    GhostChain explorers, bridges, and SDKs display "GRC" not "ERC".

    ──────────────────────────────────────────────────────────────
    Usage — single import for all base standards:

        import { GRC20 }   from "@ghostchain/contracts/grc/GRC.sol";
        import { GRC2612 } from "@ghostchain/contracts/grc/GRC.sol";

    Or import individual files directly for minimal compilation.
    ──────────────────────────────────────────────────────────────
*/

// Re-export all GRC standards for single-import convenience.
import { GRC165  } from "./GRC165.sol";
import { GRC2612 } from "./GRC2612.sol";
import { GRC2981 } from "./GRC2981.sol";
import { GRC4626 } from "./GRC4626.sol";

// GRC20 / GRC721 / GRC1155 live in src/ghost/ (existing canonical location).
import { GRC20   } from "../ghost/GRC20.sol";
import { GRC721  } from "../ghost/GRC721.sol";
import { GRC1155 } from "../ghost/GRC1155.sol";
