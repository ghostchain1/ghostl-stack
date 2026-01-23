# Compliance Contracts

Contracts:
- `ComplianceOracle.sol`: verifies ECDSA attestations from the compliance service.
- `ComplianceGuardExample.sol`: example modifier enforcing oracle attestations.
- `ComplianceProofRegistry.sol`: hash-only ZK attestation registry with issuer allowlist.
- `ComplianceProofGuard.sol`: reusable proof guard for privileged actions.
- `BridgeComplianceGuard.sol`: bridge-specific proof gate.
- `TreasuryComplianceGuard.sol`: treasury-specific proof gate.
- `GovernanceComplianceGuard.sol`: governance-specific proof gate.
- `ValidatorComplianceRegistry.sol`: on-chain validator compliance score registry.

## Build + test

```bash
cd contracts/compliance
forge test
```

## Deploy

```bash
cd contracts/compliance
export PRIVATE_KEY=... # deployer key
export COMPLIANCE_SIGNER=0x... # signer address used by the compliance API
forge script script/DeployOracle.s.sol:DeployOracle --rpc-url <RPC> --broadcast
export COMPLIANCE_REGISTRY_OWNER=0x... # governance owner
forge script script/DeployComplianceProofRegistry.s.sol:DeployComplianceProofRegistry --rpc-url <RPC> --broadcast
export VALIDATOR_REGISTRY_OWNER=0x... # governance owner
forge script script/DeployValidatorComplianceRegistry.s.sol:DeployValidatorComplianceRegistry --rpc-url <RPC> --broadcast
```

## Attestation format

The compliance API signs `paramsHash`:

```
paramsHash is computed off-chain from resource details (e.g. `keccak256(abi.encodePacked("to", address, amount))`).

digest = keccak256(abi.encodePacked(subject, action, paramsHash, expiry, chainId))
```

The oracle verifies the Ethereum Signed Message hash of `digest`.
`subject` is the wallet address, `action` is a bytes32 identifier (e.g. keccak256("TRANSFER")).

## ZK Proof Hashes

Proofs are stored as hashes in `ComplianceProofRegistry`. Issuers register proofs, and guards verify proof validity (including expiry). No PII is stored on-chain.
