// GhostChain daemon entry-point.
//
// ghostchaind is the node binary for the GhostChain Cosmos SDK chain.
// It wires the standard Cosmos SDK server commands with the GhostApp.
//
// Usage:
//
//	ghostchaind start          — start the full node
//	ghostchaind init <moniker> — initialise node configuration and genesis
//	ghostchaind keys ...       — key management
//	ghostchaind tx ghost private-transfer ... — send a private transfer
//	ghostchaind tx ghostgov create-proposal ...
//	ghostchaind query ghost proof-status ...
//	ghostchaind tendermint ...
package main

import (
	"os"

	"cosmossdk.io/log"
	svrcmd "github.com/cosmos/cosmos-sdk/server/cmd"

	"github.com/ghostchain1/ghostchain/app"
	"github.com/ghostchain1/ghostchain/cmd/ghostchaind/cmd"
)

func main() {
	rootCmd := cmd.NewRootCmd()
	if err := svrcmd.Execute(rootCmd, "GHOSTCHAIN", app.DefaultNodeHome); err != nil {
		log.NewLogger(os.Stderr).Error("fatal error", "err", err)
		os.Exit(1)
	}
}
