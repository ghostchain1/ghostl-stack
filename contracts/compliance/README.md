# Compliance Contracts

Contracts:
- `ComplianceOracle.sol`: verifies ECDSA attestations from the compliance service.
- `ComplianceGuardExample.sol`: example modifier enforcing oracle attestations.

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
```

## Attestation format

The compliance API signs `paramsHash`:

```
paramsHash is computed off-chain from resource details (e.g. `keccak256(abi.encodePacked("to", address, amount))`).

Digest for signing:

```
digest = keccak256(abi.encodePacked(subject, action, paramsHash, expiry, chainId))
```

The oracle verifies the Ethereum Signed Message hash of `digest`.
`subject` is the wallet address, `action` is a bytes32 identifier (e.g. keccak256("TRANSFER")).
```

The oracle verifies the Ethereum Signed Message hash of `paramsHash`.
