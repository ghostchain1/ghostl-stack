// Package ghostgov implements the x/ghostgov Cosmos SDK module.
//
// GhostGov extends standard on-chain governance with:
//   - AI oracle risk-tier classification (low / medium / high)
//   - Tier-adaptive quorum thresholds (30 / 50 / 67 %)
//   - Tier-adaptive timelocks (24 h / 48 h / 7 d)
//   - AI veto capability for high-risk or constitutional proposals
//   - Mirrors the Solidity GhostChainGovernor event taxonomy
package ghostgov

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

	"github.com/ghostchain1/ghostchain/x/ghostgov/keeper"
	"github.com/ghostchain1/ghostchain/x/ghostgov/types"
)

var (
	_ module.AppModuleBasic = AppModuleBasic{}
	_ appmodule.AppModule   = AppModule{}
)

// AppModuleBasic implements module.AppModuleBasic.
type AppModuleBasic struct{}

func (AppModuleBasic) Name() string                                           { return types.ModuleName }
func (AppModuleBasic) RegisterLegacyAminoCodec(*codec.LegacyAmino)           {}
func (AppModuleBasic) RegisterInterfaces(codectypes.InterfaceRegistry)        {}
func (AppModuleBasic) DefaultGenesis(cdc codec.JSONCodec) json.RawMessage {
	return json.RawMessage(`{}`)
}
func (AppModuleBasic) ValidateGenesis(codec.JSONCodec, client.TxEncodingConfig, json.RawMessage) error {
	return nil
}
func (AppModuleBasic) RegisterGRPCGatewayRoutes(_ client.Context, _ *runtime.ServeMux) {}
func (AppModuleBasic) GetTxCmd() *cobra.Command                              { return nil }
func (AppModuleBasic) GetQueryCmd() *cobra.Command                           { return nil }

// AppModule implements the full module interface.
type AppModule struct {
	AppModuleBasic
	keeper keeper.Keeper
}

func NewAppModule(k keeper.Keeper) AppModule { return AppModule{keeper: k} }

func (AppModule) IsOnePerModuleType() {}
func (AppModule) IsAppModule()        {}
func (AppModule) ConsensusVersion() uint64 { return 1 }

func (am AppModule) RegisterServices(cfg module.Configurator) {
	types.RegisterMsgServer(cfg.MsgServer(), keeper.NewMsgServerImpl(am.keeper))
}

func (am AppModule) InitGenesis(ctx sdk.Context, _ codec.JSONCodec, _ json.RawMessage) []abci.ValidatorUpdate {
	return nil
}

func (am AppModule) ExportGenesis(_ sdk.Context, _ codec.JSONCodec) json.RawMessage {
	return json.RawMessage(`{}`)
}

func (am AppModule) BeginBlock(_ context.Context) error { return nil }

// EndBlock evaluates proposals whose voting period has ended.
func (am AppModule) EndBlock(goCtx context.Context) ([]abci.ValidatorUpdate, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
	now := ctx.BlockTime().UnixNano()

	am.keeper.IterateProposals(ctx, func(p types.Proposal) bool {
		if p.Status == types.StatusVotingPeriod && now >= p.VotingEndTime {
			if err := am.keeper.FinalizeVoting(ctx, p); err != nil {
				am.keeper.Logger().Warn("failed to finalize proposal", "id", p.ID, "err", err)
			}
		}
		return false
	})
	return nil, nil
}
