// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../common/Ownable.sol";
import "../common/GhostHash.sol";

contract GhostDNSRegistry is Ownable {
    struct Record {
        string target;
        uint32 ttl;
        uint64 version;
        uint8 layer;
        address operator;
        uint64 updatedAt;
    }

    mapping(bytes32 => Record) private records;

    event RecordUpserted(
        bytes32 indexed domainHash,
        string indexed domain,
        string target,
        uint32 ttl,
        uint8 layer,
        uint64 version,
        address operator,
        uint64 updatedAt
    );

    event RecordRemoved(bytes32 indexed domainHash, string indexed domain, uint64 removedAt, address operator);

    function domainHash(string memory domain) public pure returns (bytes32) {
        return GhostHash.gnsLabelHash(domain);
    }

    function upsertRecord(string calldata domain, string calldata target, uint32 ttl, uint8 layer) external onlyOwner {
        require(bytes(domain).length > 0, "domain required");
        require(bytes(target).length > 0, "target required");
        require(ttl >= 10 && ttl <= 86400, "ttl range");
        require(layer >= 1 && layer <= 3, "layer range");

        bytes32 h = domainHash(domain);
        Record storage existing = records[h];
        uint64 nextVersion = existing.version + 1;

        records[h] = Record({
            target: target,
            ttl: ttl,
            version: nextVersion,
            layer: layer,
            operator: msg.sender,
            updatedAt: uint64(block.timestamp)
        });

        emit RecordUpserted(h, domain, target, ttl, layer, nextVersion, msg.sender, uint64(block.timestamp));
    }

    function removeRecord(string calldata domain) external onlyOwner {
        require(bytes(domain).length > 0, "domain required");
        bytes32 h = domainHash(domain);
        require(records[h].version > 0, "not found");
        delete records[h];
        emit RecordRemoved(h, domain, uint64(block.timestamp), msg.sender);
    }

    function getRecord(string calldata domain) external view returns (Record memory) {
        return records[domainHash(domain)];
    }
}
