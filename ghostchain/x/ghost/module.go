// Package ghost implements the x/ghost Cosmos SDK module.
//
// The ghost module provides:
//  1. Zero-knowledge proof verification (ZK-SNARK / Groth16, pluggable)
//  2. Ring-signature double-spend protection (LSAG key-image recording)
//  3. Private token transfers via MsgPrivateTransfer
//  4. Stand-alone proof submission via MsgSubmitProof
//
// Persistence:
//   - nullifiers/<hex>  → byte { 1 } when spent
//   - keyimages/<hex>   → byte { 1 } when recorded
package ghost

import (
	"context"
	"encoding/json"

	"cosmossdk.io/core/appmodule"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/grpc-ecosystem/grpc-gateway/runtime"
	"github.com/spf13/cobra"
	abci "github.com/cometbft/cometbft/abci/types"

	"github.com/ghostchain1/ghostchain/x/ghost/keeper"
	"github.com/ghostchain1/ghostchain/x/ghost/types"
)

var (
	_ module.AppModuleBasic = AppModuleBasic{}
	_ appmodule.AppModule   = AppModule{}
)

// AppModuleBasic implements the basic application module interface.
type AppModuleBasic struct{}

// Name returns the module name.
func (AppModuleBasic) Name() string { return types.ModuleName }

// RegisterLegacyAminoCodec is a no-op (module uses JSON, no protobuf codegen yet).
func (AppModuleBasic) RegisterLegacyAminoCodec(*codec.LegacyAmino) {}

// RegisterInterfaces registers message types with the interface registry.
func (AppModuleBasic) RegisterInterfaces(_ codectypes.InterfaceRegistry) {
	// Ghost messages are hand-written (non-proto-generated) types and cannot
	// be packed into Any fields; skip interface registration.
}

// DefaultGenesis returns the default genesis state.
func (AppModuleBasic) DefaultGenesis(cdc codec.JSONCodec) json.RawMessage {
	return cdc.MustMarshalJSON(&types.GenesisState{})
}

// ValidateGenesis validates the genesis state.
func (AppModuleBasic) ValidateGenesis(cdc codec.JSONCodec, _ client.TxEncodingConfig, bz json.RawMessage) error {
	var gs types.GenesisState
	if err := cdc.UnmarshalJSON(bz, &gs); err != nil {
		return err
	}
	return gs.Validate()
}

// RegisterGRPCGatewayRoutes registers the gRPC Gateway routes (stub).
func (AppModuleBasic) RegisterGRPCGatewayRoutes(_ client.Context, _ *runtime.ServeMux) {}

// GetTxCmd returns the root tx command (stub; CLI generation would go here).
func (AppModuleBasic) GetTxCmd() *cobra.Command { return nil }

// GetQueryCmd returns the root query command (stub).
func (AppModuleBasic) GetQueryCmd() *cobra.Command { return nil }

// ─── AppModule ──────────────────────────────────────────────────────────────

// AppModule implements the full AppModule interface for x/ghost.
type AppModule struct {
	AppModuleBasic
	keeper keeper.Keeper
}

// NewAppModule creates a new AppModule.
func NewAppModule(k keeper.Keeper) AppModule {
	return AppModule{keeper: k}
}

// IsOnePerModuleType marks this as a singleton module (one per app).
func (AppModule) IsOnePerModuleType() {}

// IsAppModule marks this as an AppModule.
func (AppModule) IsAppModule() {}

// ConsensusVersion returns the module consensus version.
func (AppModule) ConsensusVersion() uint64 { return 1 }

// RegisterServices registers the keeper's msg server with the module manager.
func (am AppModule) RegisterServices(cfg module.Configurator) {
	types.RegisterMsgServer(cfg.MsgServer(), keeper.NewMsgServerImpl(am.keeper))
}

// InitGenesis initialises the module store from a genesis state.
func (am AppModule) InitGenesis(ctx sdk.Context, cdc codec.JSONCodec, data json.RawMessage) []abci.ValidatorUpdate {
	var gs types.GenesisState
	cdc.MustUnmarshalJSON(data, &gs)
	_ = gs // nothing to write for the stub genesis
	return nil
}

// ExportGenesis exports the module store to genesis state.
func (am AppModule) ExportGenesis(ctx sdk.Context, cdc codec.JSONCodec) json.RawMessage {
	gs := types.GenesisState{}
	return cdc.MustMarshalJSON(&gs)
}

// BeginBlock is a no-op for this module.
func (am AppModule) BeginBlock(_ context.Context) error { return nil }

// EndBlock is a no-op for this module.
func (am AppModule) EndBlock(_ context.Context) ([]abci.ValidatorUpdate, error) { return nil, nil }
