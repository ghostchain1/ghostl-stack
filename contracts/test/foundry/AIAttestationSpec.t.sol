// SPDX-License-Identifier: MIT
// @ghostchain Part of the GhostChain protocol suite — https://ghostchain.cloud

pragma solidity ^0.8.24;

import "./TestBase.sol";

contract AIAttestationSpecTest is TestBase {
    string private constant DOMAIN_TYPESTRING =
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
    string private constant ATTESTATION_TYPESTRING =
        "AIAttestation(bytes32 attestationId,uint256 issuedAt,uint256 expiresAt,uint32 modelVersion,bytes32 modelCardHash,bytes32 inputHash,bytes32 outputHash,uint16 riskScoreBps,uint8 confidence,address subject,uint256 nonce,uint8 layer,bytes32 explanationRef)";

    bytes32 private constant EXPECTED_DOMAIN_TYPEHASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;
    bytes32 private constant EXPECTED_ATTESTATION_TYPEHASH =
        0xd1d84c36dfff363e325c2bd313abc2468440fe41ddf182f05e52da294beaf710;

    bytes32 private constant NAME_HASH =
        0x9993a77c31507cb26dcaca1a1832f02585be231d9d4dcbb3c804763f6ae64c84;
    bytes32 private constant VERSION_HASH =
        0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

    uint256 private constant CHAIN_ID = 901;
    address private constant VERIFYING_CONTRACT = 0x1111111111111111111111111111111111111111;

    bytes32 private constant MODEL_CARD_HASH =
        0xffbafac33bae212e532270a7a92fcf337d4b6b0dd8eadbd50f1161d1096d214f;
    bytes32 private constant INPUT_HASH =
        0x94c58e36f93af84b7aaa6f1f298e1f17719ac0f716089415dd7b0fc52462140b;
    bytes32 private constant OUTPUT_HASH =
        0xdf2e094cda4de966de648b49bb33e4cc78940d8747c74548217090b9a507ce9f;
    bytes32 private constant EXPLANATION_REF =
        0x25f17a5547d007cc33c05585a1b4bc36de866223ffbce942244767c2d4e13ecd;

    uint256 private constant ISSUED_AT = 1_700_000_000;
    uint256 private constant EXPIRES_AT = 1_700_003_600;
    uint32 private constant MODEL_VERSION = 1;
    uint16 private constant RISK_SCORE_BPS = 4_200;
    uint8 private constant CONFIDENCE = 90;
    address private constant SUBJECT = 0x2222222222222222222222222222222222222222;
    uint256 private constant NONCE = 7;
    uint8 private constant LAYER = 2;

    bytes32 private constant EXPECTED_ATTESTATION_ID =
        0x91444930e049cc24ddd8ef8fe22a135eae718a0d97b7d4eafd2a064fb73128a8;
    bytes32 private constant EXPECTED_DOMAIN_SEPARATOR =
        0xece9faf26844d24ba605c423fcaafd1f9da86be06897d04c7a0587c525ab7270;
    bytes32 private constant EXPECTED_STRUCT_HASH =
        0x11e900b3d487b3a8642f217ce5fa6c7db6835e688bf289a0e9883d13159df1c2;
    bytes32 private constant EXPECTED_DIGEST =
        0xce5daddbf1875a95c4e3a1f901469d3ab824a502ff53f02a33e6b11a1eee6282;

    struct AIAttestation {
        bytes32 attestationId;
        uint256 issuedAt;
        uint256 expiresAt;
        uint32 modelVersion;
        bytes32 modelCardHash;
        bytes32 inputHash;
        bytes32 outputHash;
        uint16 riskScoreBps;
        uint8 confidence;
        address subject;
        uint256 nonce;
        uint8 layer;
        bytes32 explanationRef;
    }

    function testTypehashesMatchSpec() public pure {
        bytes32 domainTypehash = keccak256(bytes(DOMAIN_TYPESTRING));
        bytes32 attestationTypehash = keccak256(bytes(ATTESTATION_TYPESTRING));

        assertEq(uint256(domainTypehash), uint256(EXPECTED_DOMAIN_TYPEHASH), "domain typehash");
        assertEq(uint256(attestationTypehash), uint256(EXPECTED_ATTESTATION_TYPEHASH), "attestation typehash");
    }

    function testGoldenVectorHashesMatchSpec() public pure {
        bytes32 domainSeparator = _domainSeparator();
        assertEq(uint256(domainSeparator), uint256(EXPECTED_DOMAIN_SEPARATOR), "domain separator");

        AIAttestation memory att = _goldenAttestation();

        bytes32 attestationId = _computeAttestationId(att);
        assertEq(uint256(attestationId), uint256(EXPECTED_ATTESTATION_ID), "attestation id");

        bytes32 structHash = _structHash(att);
        assertEq(uint256(structHash), uint256(EXPECTED_STRUCT_HASH), "struct hash");

        bytes32 digest = _digest(domainSeparator, structHash);
        assertEq(uint256(digest), uint256(EXPECTED_DIGEST), "digest");
    }

    function _goldenAttestation() private pure returns (AIAttestation memory att) {
        att = AIAttestation({
            attestationId: EXPECTED_ATTESTATION_ID,
            issuedAt: ISSUED_AT,
            expiresAt: EXPIRES_AT,
            modelVersion: MODEL_VERSION,
            modelCardHash: MODEL_CARD_HASH,
            inputHash: INPUT_HASH,
            outputHash: OUTPUT_HASH,
            riskScoreBps: RISK_SCORE_BPS,
            confidence: CONFIDENCE,
            subject: SUBJECT,
            nonce: NONCE,
            layer: LAYER,
            explanationRef: EXPLANATION_REF
        });
    }

    function _computeAttestationId(AIAttestation memory att) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                att.issuedAt,
                att.expiresAt,
                att.modelVersion,
                att.modelCardHash,
                att.inputHash,
                att.outputHash,
                att.riskScoreBps,
                att.confidence,
                att.subject,
                att.nonce,
                att.layer,
                att.explanationRef
            )
        );
    }

    function _structHash(AIAttestation memory att) private pure returns (bytes32) {
        bytes32 typehash = keccak256(bytes(ATTESTATION_TYPESTRING));
        return keccak256(
            abi.encode(
                typehash,
                att.attestationId,
                att.issuedAt,
                att.expiresAt,
                att.modelVersion,
                att.modelCardHash,
                att.inputHash,
                att.outputHash,
                att.riskScoreBps,
                att.confidence,
                att.subject,
                att.nonce,
                att.layer,
                att.explanationRef
            )
        );
    }

    function _domainSeparator() private pure returns (bytes32) {
        bytes32 domainTypehash = keccak256(bytes(DOMAIN_TYPESTRING));
        return keccak256(abi.encode(domainTypehash, NAME_HASH, VERSION_HASH, CHAIN_ID, VERIFYING_CONTRACT));
    }

    function _digest(bytes32 domainSeparator, bytes32 structHash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
