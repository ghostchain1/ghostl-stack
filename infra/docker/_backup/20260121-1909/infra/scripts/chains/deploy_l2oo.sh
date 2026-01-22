#!/usr/bin/env bash
set -euo pipefail

# Deploy and initialize L2OutputOracle on local L1.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OP_DIR="$ROOT_DIR/infra/opstack"
RPC_URL="${L1_RPC:-http://localhost:18545}"
CHAIN_ID="${L1_CHAIN_ID:-}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-120}"
PRIV_KEY="${PROPOSER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
L2OO_ADDRESS="${L2OO_ADDRESS:-}"
PROPOSER_ADDRESS="${PROPOSER_ADDRESS:-0x0000000000000000000000000000000000000001}"
CHALLENGER_ADDRESS="${CHALLENGER_ADDRESS:-0x0000000000000000000000000000000000000001}"

cat > "$OP_DIR/optimism/deploy_l2oo.go" <<'GOSRC'
package main

import (
    "context"
    "fmt"
    "log"
    "math/big"
    "os"
    "strconv"
    "time"

    "github.com/ethereum-optimism/optimism/op-proposer/bindings"
    "github.com/ethereum/go-ethereum/accounts/abi/bind"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/core/types"
    "github.com/ethereum/go-ethereum/crypto"
    "github.com/ethereum/go-ethereum/ethclient"
)

func main() {
    rpc := os.Getenv("RPC_URL")
    keyHex := os.Getenv("PRIV_KEY")
    chainIDStr := os.Getenv("CHAIN_ID")
    waitTimeoutSec := 120
    if v := os.Getenv("WAIT_TIMEOUT_SECONDS"); v != "" {
        if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
            waitTimeoutSec = parsed
        }
    }
    existing := os.Getenv("L2OO_ADDRESS")
    proposerAddr := os.Getenv("PROPOSER_ADDRESS")
    challengerAddr := os.Getenv("CHALLENGER_ADDRESS")
    if proposerAddr == "" {
        proposerAddr = "0x0000000000000000000000000000000000000001"
    }
    if challengerAddr == "" {
        challengerAddr = "0x0000000000000000000000000000000000000001"
    }

    client, err := ethclient.Dial(rpc)
    if err != nil {
        log.Fatalf("dial: %v", err)
    }
    priv, err := crypto.HexToECDSA(strip0x(keyHex))
    if err != nil {
        log.Fatalf("privkey: %v", err)
    }
    var chainID *big.Int
    if chainIDStr == "" {
        chainID, err = client.ChainID(context.Background())
        if err != nil {
            log.Fatalf("chainID: %v", err)
        }
        fmt.Printf("Detected L1 chainId %s\n", chainID)
    } else {
        chainID = new(big.Int)
        if _, ok := chainID.SetString(chainIDStr, 10); !ok {
            log.Fatalf("invalid CHAIN_ID: %q", chainIDStr)
        }
    }
    auth, err := bind.NewKeyedTransactorWithChainID(priv, chainID)
    if err != nil {
        log.Fatalf("transactor: %v", err)
    }
    auth.Context = context.Background()
    auth.GasPrice = big.NewInt(1_000_000_000) // basefee in genesis

    waitMined := func(tx *types.Transaction) {
        ctx, cancel := context.WithTimeout(context.Background(), time.Duration(waitTimeoutSec)*time.Second)
        defer cancel()
        receipt, err := bind.WaitMined(ctx, client, tx)
        if err != nil {
            log.Fatalf("wait mined: %v", err)
        }
        if receipt.Status != 1 {
            log.Fatalf("tx failed: %s", tx.Hash())
        }
    }

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
        waitMined(tx)
    }

    code, err := client.CodeAt(context.Background(), addr, nil)
    if err != nil {
        log.Fatalf("codeAt: %v", err)
    }
    if len(code) == 0 {
        log.Fatalf("no contract code at given address %s", addr)
    }

    contract, err := bindings.NewL2OutputOracle(addr, client)
    if err != nil {
        log.Fatalf("bind: %v", err)
    }

    callOpts := &bind.CallOpts{Context: context.Background()}
    submissionInterval, err := contract.SubmissionInterval(callOpts)
    if err != nil {
        log.Fatalf("submission interval: %v", err)
    }
    if submissionInterval.Sign() != 0 {
        fmt.Printf("L2OutputOracle already initialized (submissionInterval=%s)\n", submissionInterval)
        return
    }

    submissionInterval = big.NewInt(1)
    l2BlockTime := big.NewInt(2)
    startingBlockNumber := big.NewInt(0)
    startingTimestamp := big.NewInt(1)
    proposer := common.HexToAddress(proposerAddr)
    challenger := common.HexToAddress(challengerAddr)
    finalizationPeriodSeconds := big.NewInt(12)

    auth.Nonce = nil
    tx, err := contract.Initialize(auth, submissionInterval, l2BlockTime, startingBlockNumber, startingTimestamp, proposer, challenger, finalizationPeriodSeconds)
    if err != nil {
        log.Fatalf("initialize: %v", err)
    }
    fmt.Printf("Initialized L2OO at %s tx=%s\n", addr, tx.Hash())
    waitMined(tx)
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
  -e RPC_URL="$RPC_URL" -e PRIV_KEY="$PRIV_KEY" -e CHAIN_ID="$CHAIN_ID" -e L2OO_ADDRESS="$L2OO_ADDRESS" -e WAIT_TIMEOUT_SECONDS="$WAIT_TIMEOUT_SECONDS" \
  -e PROPOSER_ADDRESS="$PROPOSER_ADDRESS" -e CHALLENGER_ADDRESS="$CHALLENGER_ADDRESS" \
  -w /work/infra/opstack/optimism \
  -v "$ROOT_DIR":/work -v /home/ghost/go:/go -v /home/ghost/.cache/go-build:/root/.cache/go-build \
  golang:1.24 /usr/local/go/bin/go run deploy_l2oo.go
rm deploy_l2oo.go
popd >/dev/null
