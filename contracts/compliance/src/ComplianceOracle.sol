// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ComplianceOracle {
    address public signer;
    address public owner;

    error Unauthorized();

    constructor(address initialSigner) {
        owner = msg.sender;
        signer = initialSigner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setSigner(address nextSigner) external onlyOwner {
        signer = nextSigner;
    }

    function getEthSignedMessageHash(bytes32 digest) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
    }

    function isValidAttestation(
        address subject,
        bytes32 action,
        bytes32 paramsHash,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool) {
        if (block.timestamp > expiry) {
            return false;
        }
        bytes32 digest = keccak256(abi.encodePacked(subject, action, paramsHash, expiry, block.chainid));
        address recovered = recoverSigner(digest, signature);
        return recovered == signer;
    }

    function recoverSigner(bytes32 digest, bytes calldata signature) public pure returns (address) {
        bytes32 ethSigned = getEthSignedMessageHash(digest);
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        return ecrecover(ethSigned, v, r, s);
    }

    function splitSignature(bytes calldata signature) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(signature.length == 65, "invalid signature length");
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) {
            v += 27;
        }
    }
}
