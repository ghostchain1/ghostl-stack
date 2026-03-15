// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PassportToken — non-transferable sovereign digital identity token (soul-bound)
contract PassportToken {

    struct Passport {
        uint256 tokenId;
        address holder;
        bytes32 countryHash;        // keccak256(ISO country code)
        bytes32 identityCommitment; // hash of off-chain biometric/doc data
        uint256 issuedAt;
        uint256 expiresAt;
        bool    revoked;
    }

    uint256 public nextTokenId;
    mapping(uint256 => Passport)  public passports;
    mapping(address => uint256)   public holderToken;   // one passport per address
    mapping(bytes32 => bool)      public commitmentUsed; // prevent double-issuance

    address public governance;
    mapping(address => bool) public authorisedIssuers;

    event PassportIssued(uint256 indexed tokenId, address indexed holder, bytes32 countryHash);
    event PassportRevoked(uint256 indexed tokenId, string reason);

    modifier onlyGovernance() {
        require(msg.sender == governance, "PassportToken: not governance");
        _;
    }

    modifier onlyIssuer() {
        require(authorisedIssuers[msg.sender] || msg.sender == governance,
            "PassportToken: not issuer");
        _;
    }

    constructor(address _gov) {
        governance = _gov;
        authorisedIssuers[_gov] = true;
    }

    function authoriseIssuer(address issuer, bool status) external onlyGovernance {
        authorisedIssuers[issuer] = status;
    }

    /// @param holder   — recipient wallet
    /// @param countryHash — keccak256(ISO-3166-1 alpha-3 code)
    /// @param identityCommitment — keccak256(biometric-proof || docHash) — never raw PII
    /// @param validYears — passport validity (e.g. 10)
    function issuePassport(
        address holder,
        bytes32 countryHash,
        bytes32 identityCommitment,
        uint256 validYears
    ) external onlyIssuer returns (uint256 tokenId) {
        require(holderToken[holder] == 0, "PassportToken: holder already has passport");
        require(!commitmentUsed[identityCommitment], "PassportToken: commitment already used");

        tokenId = ++nextTokenId;  // start at 1
        uint256 expiresAt = block.timestamp + (validYears * 365 days);

        passports[tokenId] = Passport({
            tokenId:            tokenId,
            holder:             holder,
            countryHash:        countryHash,
            identityCommitment: identityCommitment,
            issuedAt:           block.timestamp,
            expiresAt:          expiresAt,
            revoked:            false
        });
        holderToken[holder]                = tokenId;
        commitmentUsed[identityCommitment] = true;

        emit PassportIssued(tokenId, holder, countryHash);
    }

    function revokePassport(uint256 tokenId, string calldata reason) external onlyIssuer {
        require(!passports[tokenId].revoked, "PassportToken: already revoked");
        passports[tokenId].revoked = true;
        emit PassportRevoked(tokenId, reason);
    }

    function isValidPassport(address holder) external view returns (bool) {
        uint256 tokenId = holderToken[holder];
        if (tokenId == 0) return false;
        Passport storage p = passports[tokenId];
        return !p.revoked && block.timestamp <= p.expiresAt;
    }

    /// @dev Soul-bound: transfers are blocked
    function transfer(address, uint256) external pure {
        revert(unicode"PassportToken: soul-bound \u2014 non-transferable");
    }
}
