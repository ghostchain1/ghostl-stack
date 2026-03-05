// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/constitutional/BrandingInvariant.sol";

/// @dev Concrete harness for testing abstract BrandingInvariant
contract BrandingInvariantHarness is BrandingInvariant {
    function assertName(string memory name) external {
        _assertBrandName(name);
    }
    function assertSymbol(string memory symbol) external {
        _assertBrandSymbol(symbol);
    }
    function assertDecimals(uint8 d) external {
        _assertBrandDecimals(d);
    }
    function assertTriple(string memory name, string memory symbol, uint8 d) external {
        _assertBrandTriple(name, symbol, d);
    }
    function assertNoLegacy(string memory value, string memory field) external {
        _assertNoLegacyBranding(value, field);
    }
}

contract BrandingInvariantTest is Test {
    BrandingInvariantHarness bi;

    function setUp() public {
        bi = new BrandingInvariantHarness();
    }

    // ─── Valid brand ──────────────────────────────────────────────────────────

    function test_canonicalName_passes() public {
        bi.assertName("Ghost");
    }

    function test_canonicalSymbol_passes() public {
        bi.assertSymbol("GST");
    }

    function test_canonicalDecimals_passes() public {
        bi.assertDecimals(18);
    }

    function test_canonicalTriple_passes() public {
        bi.assertTriple("Ghost", "GST", 18);
    }

    function test_isCanonicalBrand_true() public view {
        assertTrue(bi.isCanonicalBrand("Ghost", "GST", 18));
    }

    // ─── Invalid name ─────────────────────────────────────────────────────────

    function test_wrongName_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            BrandingInvariant.BrandingInvariant_InvalidName.selector,
            "Ethereum",
            "Ghost"
        ));
        bi.assertName("Ethereum");
    }

    function test_lowercaseName_reverts() public {
        vm.expectRevert();
        bi.assertName("ghost");
    }

    function test_emptyName_reverts() public {
        vm.expectRevert();
        bi.assertName("");
    }

    // ─── Invalid symbol ───────────────────────────────────────────────────────

    function test_wrongSymbol_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            BrandingInvariant.BrandingInvariant_InvalidSymbol.selector,
            "ETH",
            "GST"
        ));
        bi.assertSymbol("ETH");
    }

    function test_lowercaseSymbol_reverts() public {
        vm.expectRevert();
        bi.assertSymbol("gst");
    }

    // ─── Invalid decimals ─────────────────────────────────────────────────────

    function test_wrongDecimals_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            BrandingInvariant.BrandingInvariant_InvalidDecimals.selector,
            6, 18
        ));
        bi.assertDecimals(6);
    }

    function test_zeroDecimals_reverts() public {
        vm.expectRevert();
        bi.assertDecimals(0);
    }

    // ─── Legacy branding detection ────────────────────────────────────────────

    function test_eth_legacy_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(
            BrandingInvariant.BrandingInvariant_LegacyBrandingForbidden.selector,
            "symbol"
        ));
        bi.assertNoLegacy("eth", "symbol");
    }

    function test_ETH_uppercase_reverts() public {
        vm.expectRevert();
        bi.assertNoLegacy("ETH", "symbol");
    }

    function test_ether_legacy_reverts() public {
        vm.expectRevert();
        bi.assertNoLegacy("ether", "name");
    }

    function test_ethereum_legacy_reverts() public {
        vm.expectRevert();
        bi.assertNoLegacy("ETHEREUM", "name");
    }

    function test_GST_no_legacy_passes() public {
        bi.assertNoLegacy("GST", "symbol");
    }

    function test_Ghost_no_legacy_passes() public {
        bi.assertNoLegacy("Ghost", "name");
    }

    // ─── isCanonicalBrand pure view ───────────────────────────────────────────

    function test_isCanonicalBrand_wrongName_false() public view {
        assertFalse(bi.isCanonicalBrand("Ethereum", "GST", 18));
    }

    function test_isCanonicalBrand_wrongSymbol_false() public view {
        assertFalse(bi.isCanonicalBrand("Ghost", "ETH", 18));
    }

    function test_isCanonicalBrand_wrongDecimals_false() public view {
        assertFalse(bi.isCanonicalBrand("Ghost", "GST", 6));
    }
}
