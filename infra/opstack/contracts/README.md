# OP Stack contract stubs (canonicalized)

These stub contracts (L2 output oracle, guard policy, gas token, etc.) are now maintained under the main Hardhat project at `contracts/src/opstack/`. Keep this folder only as a reference to avoid duplication in build pipelines.

Canonical sources:
- `contracts/src/opstack/L2OutputOracleStub.sol`
- `contracts/src/opstack/GuardPolicyStub.sol`
- `contracts/src/opstack/DummyL2OO.sol`
- `contracts/src/opstack/GasToken.sol`

If you need to deploy/build them, use the root `contracts` package (Hardhat). Remove drift by editing only the canonical files above.
