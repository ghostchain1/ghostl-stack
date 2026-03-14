# ghost-geth — GhostChain L1 Execution Client Image

`ghostchain/ghost-geth` is a GhostChain-branded Docker image wrapping the
upstream `ethereum/client-go` alltools image. It is a drop-in replacement
for `ethereum/client-go` in all GhostChain infrastructure scripts — same
binaries, GhostChain registry path.

## Build

```sh
# Build with a specific upstream tag
docker build \
  --build-arg GETH_TAG=alltools-v1.13.14 \
  -t ghostchain/ghost-geth:v1.13.14 \
  infra/ghost-geth/

# Build latest stable
docker build \
  --build-arg GETH_TAG=stable \
  -t ghostchain/ghost-geth:stable \
  infra/ghost-geth/
```

## Usage

Set `GETH_IMAGE` to use the GhostChain branded image:

```sh
# In scripts/testnet/common.sh or any compose env file:
export GETH_IMAGE=ghostchain/ghost-geth:v1.13.14

# In infra/ghostchain/.env.l1:
L1_GETH_IMAGE=ghostchain/ghost-geth:alltools-v1.13.14
```

## Included binaries (from alltools)

All binaries from `ethereum/client-go:alltools-*` are present:
`geth`, `bootnode`, `clef`, `puppeth`, `evm`, `rlpdump`, `abigen`, `ethkey`, etc.

## Chain ID

GhostChain L1 chain ID: **14000101**

Set `CHAIN_ID=14000101` in the container environment for the banner to display correctly.
