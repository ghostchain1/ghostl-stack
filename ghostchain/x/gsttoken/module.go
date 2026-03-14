// Package gsttoken implements the x/gsttoken Cosmos SDK module.
//
// gsttoken manages the GhostChain native token (GST) economics:
//   - Native denom "ugst" (micro-GST; 1 GST = 1_000_000 ugst)
//   - Genesis mint of 1 billion GST to the community pool
//   - Gas sponsorship: a whitelisted sponsor may pay gas on behalf of a user
//   - Fee burning: a configurable fraction of the block fee is burned (deflationary)
//   - Simple fee-split: proposer bonus + validator rewards + burn
//
// Integration points:
//   - Wraps the standard bank and auth modules for token accounting
//   - The AnteHandler (app/ante.go) calls gsttoken.SponsoredGasDecorator
//     to enable account-abstraction-style gas sponsorship
package gsttoken

import (
	"context"
	"encoding/json"

	"cosmossdk.io/core/appmodule"
	"cosmossdk.io/math"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/grpc-ecosystem/grpc-gateway/runtime"
	"github.com/spf13/cobra"
	abci "github.com/cometbft/cometbft/abci/types"
)

const (
	ModuleName = "gsttoken"
	Denom      = "ugst"
	// GenesisSupply is the genesis mint in ugst (1 billion GST).
	GenesisSupply = 1_000_000_000 * 1_000_000
	// BurnBPS is the basis-points fraction of block fees burned (500 = 5 %).
	BurnBPS = 500
)

var (
	_ module.AppModuleBasic = AppModuleBasic{}
	_ appmodule.AppModule   = AppModule{}
)

// AppModuleBasic implements module.AppModuleBasic.
type AppModuleBasic struct{}

func (AppModuleBasic) Name() string                                           { return ModuleName }
func (AppModuleBasic) RegisterLegacyAminoCodec(*codec.LegacyAmino)           {}
func (AppModuleBasic) RegisterInterfaces(codectypes.InterfaceRegistry)        {}
func (AppModuleBasic) DefaultGenesis(_ codec.JSONCodec) json.RawMessage {
	gs := GenesisState{
		GenesisAccounts: []GenesisAccount{},
		BurnBPS:         BurnBPS,
		GasSponsorList:  []string{},
	}
	bz, _ := json.Marshal(gs)
	return bz
}
func (AppModuleBasic) ValidateGenesis(_ codec.JSONCodec, _ client.TxEncodingConfig, bz json.RawMessage) error {
	var gs GenesisState
	return json.Unmarshal(bz, &gs)
}
func (AppModuleBasic) RegisterGRPCGatewayRoutes(_ client.Context, _ *runtime.ServeMux) {}
func (AppModuleBasic) GetTxCmd() *cobra.Command                              { return nil }
func (AppModuleBasic) GetQueryCmd() *cobra.Command                           { return nil }

// AppModule implements the full module interface.
type AppModule struct {
	AppModuleBasic
	keeper Keeper
}

func NewAppModule(k Keeper) AppModule { return AppModule{keeper: k} }

func (AppModule) IsOnePerModuleType() {}
func (AppModule) IsAppModule()        {}
func (AppModule) ConsensusVersion() uint64 { return 1 }
func (am AppModule) RegisterServices(module.Configurator) {}

func (am AppModule) InitGenesis(ctx sdk.Context, _ codec.JSONCodec, raw json.RawMessage) []abci.ValidatorUpdate {
	var gs GenesisState
	if err := json.Unmarshal(raw, &gs); err != nil {
		panic("gsttoken: invalid genesis state: " + err.Error())
	}
	am.keeper.InitGenesis(ctx, gs)
	return nil
}

func (am AppModule) ExportGenesis(ctx sdk.Context, _ codec.JSONCodec) json.RawMessage {
	gs := am.keeper.ExportGenesis(ctx)
	bz, _ := json.Marshal(gs)
	return bz
}

func (am AppModule) BeginBlock(_ context.Context) error { return nil }
func (am AppModule) EndBlock(_ context.Context) ([]abci.ValidatorUpdate, error) {
	return nil, nil
}

// ─── Genesis types ───────────────────────────────────────────────────────────

// GenesisState is the genesis state of the gsttoken module.
type GenesisState struct {
	// GenesisAccounts are pre-funded accounts at genesis.
	GenesisAccounts []GenesisAccount `json:"genesis_accounts"`
	// BurnBPS is the fee burn fraction in basis points.
	BurnBPS int64 `json:"burn_bps"`
	// GasSponsorList is the initial whitelist of gas-sponsor addresses.
	GasSponsorList []string `json:"gas_sponsor_list"`
}

// GenesisAccount maps a bech32 address to an initial ugst balance.
type GenesisAccount struct {
	Address string     `json:"address"`
	Balance math.Int   `json:"balance"`
}

// ─── Keeper ──────────────────────────────────────────────────────────────────

// BankKeeper is the subset of bank keeper methods needed.
type BankKeeper interface {
	MintCoins(ctx context.Context, moduleName string, amounts sdk.Coins) error
	SendCoinsFromModuleToAccount(ctx context.Context, senderModule string, recipientAddr sdk.AccAddress, amt sdk.Coins) error
	BurnCoins(ctx context.Context, moduleName string, amounts sdk.Coins) error
	SendCoins(ctx context.Context, from, to sdk.AccAddress, amt sdk.Coins) error
	HasBalance(ctx context.Context, addr sdk.AccAddress, amt sdk.Coin) bool
}

// Keeper manages the gsttoken module state.
type Keeper struct {
	bank           BankKeeper
	gasSponsorList map[string]bool // bech32 → allowed
	burnBPS        int64
}

// NewKeeper constructs a new gsttoken Keeper.
func NewKeeper(bank BankKeeper) Keeper {
	return Keeper{
		bank:           bank,
		gasSponsorList: map[string]bool{},
		burnBPS:        BurnBPS,
	}
}

// InitGenesis initialises the module from genesis state.
func (k *Keeper) InitGenesis(ctx sdk.Context, gs GenesisState) {
	k.burnBPS = gs.BurnBPS
	k.gasSponsorList = make(map[string]bool, len(gs.GasSponsorList))
	for _, addr := range gs.GasSponsorList {
		k.gasSponsorList[addr] = true
	}
	// Mint genesis allocations.
	for _, acc := range gs.GenesisAccounts {
		recipient, err := sdk.AccAddressFromBech32(acc.Address)
		if err != nil {
			panic("gsttoken: invalid genesis account address: " + err.Error())
		}
		coins := sdk.NewCoins(sdk.NewCoin(Denom, acc.Balance))
		if err := k.bank.MintCoins(ctx, ModuleName, coins); err != nil {
			panic("gsttoken: mint failed: " + err.Error())
		}
		if err := k.bank.SendCoinsFromModuleToAccount(ctx, ModuleName, recipient, coins); err != nil {
			panic("gsttoken: send failed: " + err.Error())
		}
	}
}

// ExportGenesis exports the current module state.
func (k *Keeper) ExportGenesis(_ sdk.Context) GenesisState {
	sponsors := make([]string, 0, len(k.gasSponsorList))
	for addr := range k.gasSponsorList {
		sponsors = append(sponsors, addr)
	}
	return GenesisState{
		BurnBPS:        k.burnBPS,
		GasSponsorList: sponsors,
	}
}

// IsGasSponsor reports whether the given bech32 address is a whitelisted
// gas sponsor.  Gas sponsors may pay tx fees on behalf of other accounts,
// enabling account-abstraction-style sponsored transactions.
func (k *Keeper) IsGasSponsor(addr string) bool {
	return k.gasSponsorList[addr]
}

// AddGasSponsor adds an address to the gas-sponsor whitelist (governance op).
func (k *Keeper) AddGasSponsor(addr string) { k.gasSponsorList[addr] = true }

// RemoveGasSponsor removes an address from the gas-sponsor whitelist.
func (k *Keeper) RemoveGasSponsor(addr string) { delete(k.gasSponsorList, addr) }

// BurnFees burns the configured BPS fraction of the provided fee coins.
// The remainder is returned to the caller for normal distribution.
func (k *Keeper) BurnFees(ctx context.Context, fees sdk.Coins) (sdk.Coins, error) {
	if k.burnBPS <= 0 {
		return fees, nil
	}
	burned := make(sdk.Coins, len(fees))
	remaining := make(sdk.Coins, len(fees))
	for i, coin := range fees {
		burnAmt := coin.Amount.MulRaw(k.burnBPS).QuoRaw(10000)
		burned[i] = sdk.Coin{Denom: coin.Denom, Amount: burnAmt}
		remaining[i] = sdk.Coin{Denom: coin.Denom, Amount: coin.Amount.Sub(burnAmt)}
	}
	if err := k.bank.BurnCoins(ctx, ModuleName, burned); err != nil {
		return fees, err
	}
	return remaining, nil
}
