#!/usr/bin/env bash
set -euo pipefail

# Deploy and initialize L2OutputOracle on local L1.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OP_DIR="$ROOT_DIR/infra/opstack"
RPC_URL="${L1_RPC:-http://localhost:28545}"
CHAIN_ID="${L1_CHAIN_ID:-31337}"
PRIV_KEY="${PROPOSER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
L2OO_ADDRESS="${L2OO_ADDRESS:-}"

cat > "$OP_DIR/optimism/deploy_l2oo.go" <<'GOSRC'
package main

import (
    "context"
    "fmt"
    "log"
    "math/big"
    "os"

    "github.com/ethereum-optimism/optimism/op-proposer/bindings"
    "github.com/ethereum/go-ethereum/accounts/abi/bind"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/crypto"
    "github.com/ethereum/go-ethereum/ethclient"
)

func main() {
    rpc := os.Getenv("RPC_URL")
    keyHex := os.Getenv("PRIV_KEY")
    chainIDStr := os.Getenv("CHAIN_ID")
    existing := os.Getenv("L2OO_ADDRESS")

    client, err := ethclient.Dial(rpc)
    if err != nil {
        log.Fatalf("dial: %v", err)
    }
    priv, err := crypto.HexToECDSA(strip0x(keyHex))
    if err != nil {
        log.Fatalf("privkey: %v", err)
    }
    chainID := new(big.Int)
    chainID.SetString(chainIDStr, 10)
    auth, err := bind.NewKeyedTransactorWithChainID(priv, chainID)
    if err != nil {
        log.Fatalf("transactor: %v", err)
    }
    auth.Context = context.Background()
    auth.GasPrice = big.NewInt(1_000_000_000) // basefee in genesis

    var addr common.Address
    if existing != "" {
        addr = common.HexToAddress(existing)
        fmt.Printf("Using existing L2OutputOracle at %s\n", addr)
    } else {
        deployed, tx, _, err := bindings.DeployL2OutputOracle(auth, client)
        if err != nil {
            log.Fatalf("deploy: %v", err)
        }
        addr = deployed
        fmt.Printf("L2OutputOracle deployed at %s tx=%s\n", addr, tx.Hash())
    }

    contract, err := bindings.NewL2OutputOracleTransactor(addr, client)
    if err != nil {
        log.Fatalf("bind: %v", err)
    }

    submissionInterval := big.NewInt(1)
    l2BlockTime := big.NewInt(2)
    startingBlockNumber := big.NewInt(0)
    startingTimestamp := big.NewInt(1)
    proposer := common.HexToAddress("0x0000000000000000000000000000000000000001")
    challenger := common.HexToAddress("0x0000000000000000000000000000000000000001")
    finalizationPeriodSeconds := big.NewInt(12)

    auth.Nonce = nil
    tx, err := contract.Initialize(auth, submissionInterval, l2BlockTime, startingBlockNumber, startingTimestamp, proposer, challenger, finalizationPeriodSeconds)
    if err != nil {
        log.Fatalf("initialize: %v", err)
    }
    fmt.Printf("Initialized L2OO at %s tx=%s\n", addr, tx.Hash())
}

func strip0x(s string) string {
    if len(s) >= 2 && s[:2] == "0x" {
        return s[2:]
    }
    return s
}
GOSRC

pushd "$OP_DIR/optimism" >/dev/null
docker run --rm --network host \
  -e RPC_URL="$RPC_URL" -e PRIV_KEY="$PRIV_KEY" -e CHAIN_ID="$CHAIN_ID" -e L2OO_ADDRESS="$L2OO_ADDRESS" \
  -w /work/infra/opstack/optimism \
  -v "$ROOT_DIR":/work -v /home/ghost/go:/go -v /home/ghost/.cache/go-build:/root/.cache/go-build \
  golang:1.24 /usr/local/go/bin/go run deploy_l2oo.go
rm deploy_l2oo.go
popd >/dev/null
