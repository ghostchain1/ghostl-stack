// Package app wires all GhostChain modules together into a Cosmos SDK
// application following the cosmos-sdk v0.50 patterns.
//
// Module set:
//   Standard SDK:  auth, bank, staking, slashing, distribution, params, upgrade,
//                  evidence, feegrant, authz
//   IBC:           ibc, transfer, ibcfee (ibc-go v8)
//   Ghost-custom:  x/ghost (privacy), x/ghostgov (AI governance), x/gsttoken (GST)
//
// The app implements the Cosmos SDK ABCIApp interface via BaseApp.
package app

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"

	dbm "github.com/cosmos/cosmos-db"
	"cosmossdk.io/log"
	math "cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	upgradekeeper "cosmossdk.io/x/upgrade/keeper"
	upgradetypes "cosmossdk.io/x/upgrade/types"
	abci "github.com/cometbft/cometbft/abci/types"
	cmtproto "github.com/cometbft/cometbft/proto/tendermint/types"
	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/codec"
	addresscodec "github.com/cosmos/cosmos-sdk/codec/address"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/runtime"
	"github.com/cosmos/cosmos-sdk/server/api"
	"github.com/cosmos/cosmos-sdk/server/config"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/cosmos/cosmos-sdk/types/module"
	"github.com/cosmos/cosmos-sdk/x/auth"
	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	authsim "github.com/cosmos/cosmos-sdk/x/auth/simulation"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/cosmos/cosmos-sdk/x/bank"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/cosmos/cosmos-sdk/x/distribution"
	distrkeeper "github.com/cosmos/cosmos-sdk/x/distribution/keeper"
	distrtypes "github.com/cosmos/cosmos-sdk/x/distribution/types"
	"github.com/cosmos/cosmos-sdk/x/params"
	paramskeeper "github.com/cosmos/cosmos-sdk/x/params/keeper"
	paramstypes "github.com/cosmos/cosmos-sdk/x/params/types"
	"github.com/cosmos/cosmos-sdk/x/slashing"
	slashingkeeper "github.com/cosmos/cosmos-sdk/x/slashing/keeper"
	slashingtypes "github.com/cosmos/cosmos-sdk/x/slashing/types"
	"github.com/cosmos/cosmos-sdk/x/staking"
	stakingkeeper "github.com/cosmos/cosmos-sdk/x/staking/keeper"
	stakingtypes "github.com/cosmos/cosmos-sdk/x/staking/types"
	capabilitykeeper "github.com/cosmos/ibc-go/modules/capability/keeper"
	capabilitytypes "github.com/cosmos/ibc-go/modules/capability/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v8/modules/apps/transfer/types"
	ibc "github.com/cosmos/ibc-go/v8/modules/core"
	ibckeeper "github.com/cosmos/ibc-go/v8/modules/core/keeper"
	ibcexported "github.com/cosmos/ibc-go/v8/modules/core/exported"
	ibctm "github.com/cosmos/ibc-go/v8/modules/light-clients/07-tendermint"
	"github.com/cosmos/cosmos-sdk/x/consensus"
	consensuskeeper "github.com/cosmos/cosmos-sdk/x/consensus/keeper"
	consensustypes "github.com/cosmos/cosmos-sdk/x/consensus/types"
	"github.com/cosmos/cosmos-sdk/x/genutil"
	genutiltypes "github.com/cosmos/cosmos-sdk/x/genutil/types"
	cryptocodec "github.com/cosmos/cosmos-sdk/crypto/codec"
	proto "github.com/cosmos/gogoproto/proto"
	signing "cosmossdk.io/x/tx/signing"

	cmtservice "github.com/cosmos/cosmos-sdk/client/grpc/cmtservice"
	nodeservice "github.com/cosmos/cosmos-sdk/client/grpc/node"
	"github.com/cosmos/cosmos-sdk/server"
	serverconfig "github.com/cosmos/cosmos-sdk/server/config"

	ghostmodule "github.com/ghostchain1/ghostchain/x/ghost"
	ghostkeeper "github.com/ghostchain1/ghostchain/x/ghost/keeper"
	ghosttypes "github.com/ghostchain1/ghostchain/x/ghost/types"
	ghostgov "github.com/ghostchain1/ghostchain/x/ghostgov"
	ghostgovkeeper "github.com/ghostchain1/ghostchain/x/ghostgov/keeper"
	ghostgovtypes "github.com/ghostchain1/ghostchain/x/ghostgov/types"
	gsttoken "github.com/ghostchain1/ghostchain/x/gsttoken"
)

const (
	// AppName is the human-readable application name.
	AppName = "GhostChain"
	// Bech32PrefixAccAddr is the prefix for GhostChain bech32 account addresses.
	Bech32PrefixAccAddr = "ghost"
)

var (
	// DefaultNodeHome is the default home directory for ghostchaind.
	DefaultNodeHome string

	// ModuleBasics defines the set of module codecs for genesis and encoding.
	ModuleBasics = module.NewBasicManager(
		auth.AppModuleBasic{},
		bank.AppModuleBasic{},
		staking.AppModuleBasic{},
		distribution.AppModuleBasic{},
		slashing.AppModuleBasic{},
		params.AppModuleBasic{},
		ibc.AppModuleBasic{},
		ibctm.AppModuleBasic{},
		consensus.AppModuleBasic{},
		genutil.NewAppModuleBasic(genutiltypes.DefaultMessageValidator),
		ghostmodule.AppModuleBasic{},
		ghostgov.AppModuleBasic{},
		gsttoken.AppModuleBasic{},
	)
)

func init() {
	userHomeDir, _ := os.UserHomeDir()
	DefaultNodeHome = filepath.Join(userHomeDir, ".ghostchaind")

	// Set GhostChain bech32 address prefixes.
	config := sdk.GetConfig()
	config.SetBech32PrefixForAccount(Bech32PrefixAccAddr, Bech32PrefixAccAddr+"pub")
	config.SetBech32PrefixForValidator(Bech32PrefixAccAddr+"valoper", Bech32PrefixAccAddr+"valoperpub")
	config.SetBech32PrefixForConsensusNode(Bech32PrefixAccAddr+"valcons", Bech32PrefixAccAddr+"valconspub")
	config.Seal()
}

// GhostApp is the GhostChain Cosmos SDK application.
type GhostApp struct {
	*baseapp.BaseApp

	cdc               *codec.ProtoCodec
	interfaceRegistry codectypes.InterfaceRegistry

	// Store keys
	keys    map[string]*storetypes.KVStoreKey
	tkeys   map[string]*storetypes.TransientStoreKey
	memkeys map[string]*storetypes.MemoryStoreKey

	// ─── Standard SDK keepers ────────────────────────────────────────────────
	AccountKeeper    authkeeper.AccountKeeper
	BankKeeper       bankkeeper.Keeper
	StakingKeeper    *stakingkeeper.Keeper
	SlashingKeeper   slashingkeeper.Keeper
	DistrKeeper      distrkeeper.Keeper
	ParamsKeeper     paramskeeper.Keeper

	// ─── IBC keepers ─────────────────────────────────────────────────────────
	CapabilityKeeper *capabilitykeeper.Keeper
	IBCKeeper        *ibckeeper.Keeper
	UpgradeKeeper    *upgradekeeper.Keeper

	// ─── Consensus params keeper ────────────────────────────────────────────
	ConsensusParamsKeeper consensuskeeper.Keeper

	// ─── Ghost-custom keepers ─────────────────────────────────────────────────
	GhostKeeper   ghostkeeper.Keeper
	GhostGovKeeper ghostgovkeeper.Keeper
	GSTKeeper     gsttoken.Keeper

	// Module manager
	mm           *module.Manager
	configurator module.Configurator
}

// NewGhostApp constructs a new GhostApp.
func NewGhostApp(
	logger log.Logger,
	db dbm.DB,
	traceStore io.Writer,
	loadLatest bool,
	appOpts servertypes.AppOptions,
	baseAppOptions ...func(*baseapp.BaseApp),
) *GhostApp {
	// ── Codec setup ───────────────────────────────────────────────────────────
	interfaceRegistry, err := codectypes.NewInterfaceRegistryWithOptions(codectypes.InterfaceRegistryOptions{
		ProtoFiles: proto.HybridResolver,
		SigningOptions: signing.Options{
			AddressCodec:          addresscodec.NewBech32Codec(Bech32PrefixAccAddr),
			ValidatorAddressCodec: addresscodec.NewBech32Codec(Bech32PrefixAccAddr + "valoper"),
		},
	})
	if err != nil {
		panic(err)
	}
	cryptocodec.RegisterInterfaces(interfaceRegistry)
	// Register all module interfaces (replaces the ad-hoc per-module calls below).
	ModuleBasics.RegisterInterfaces(interfaceRegistry)
	cdc := codec.NewProtoCodec(interfaceRegistry)
	legacyAmino := codec.NewLegacyAmino()
	ModuleBasics.RegisterLegacyAminoCodec(legacyAmino)

	// ── BaseApp ───────────────────────────────────────────────────────────────
	// ── TxConfig + BaseApp ───────────────────────────────────────────────────
	txConfig := authtx.NewTxConfig(cdc, authtx.DefaultSignModes)

	bApp := baseapp.NewBaseApp(AppName, logger, db, txConfig.TxDecoder(), baseAppOptions...)
	bApp.SetCommitMultiStoreTracer(traceStore)
	bApp.SetVersion("1.0.0")
	bApp.SetInterfaceRegistry(interfaceRegistry)

	app := &GhostApp{
		BaseApp:           bApp,
		cdc:               cdc,
		interfaceRegistry: interfaceRegistry,
		keys:              make(map[string]*storetypes.KVStoreKey),
		tkeys:             make(map[string]*storetypes.TransientStoreKey),
		memkeys:           make(map[string]*storetypes.MemoryStoreKey),
	}

	// ── Store keys ────────────────────────────────────────────────────────────
	storeKeys := storetypes.NewKVStoreKeys(
		authtypes.StoreKey,
		banktypes.StoreKey,
		stakingtypes.StoreKey,
		distrtypes.StoreKey,
		slashingtypes.StoreKey,
		paramstypes.StoreKey,
		ibcexported.StoreKey,
		ibctransfertypes.StoreKey,
		upgradetypes.StoreKey,
		capabilitytypes.StoreKey,
		consensustypes.StoreKey,
		ghosttypes.StoreKey,
		ghostgovtypes.StoreKey,
		gsttoken.ModuleName,
	)
	for k, v := range storeKeys {
		app.keys[k] = v
	}
	tkeys := storetypes.NewTransientStoreKeys(paramstypes.TStoreKey)
	for k, v := range tkeys {
		app.tkeys[k] = v
	}
	memkeys := storetypes.NewMemoryStoreKeys(capabilitytypes.MemStoreKey)
	for k, v := range memkeys {
		app.memkeys[k] = v
	}

	// ── Params keeper ──────────────────────────────────────────────────────────
	app.ParamsKeeper = paramskeeper.NewKeeper(
		cdc, legacyAmino, app.keys[paramstypes.StoreKey], app.tkeys[paramstypes.TStoreKey],
	)

	// ── Consensus params keeper ──────────────────────────────────────────────
	app.ConsensusParamsKeeper = consensuskeeper.NewKeeper(
		cdc,
		runtime.NewKVStoreService(storeKeys[consensustypes.StoreKey]),
		authtypes.NewModuleAddress("gov").String(),
		runtime.EventService{},
	)
	bApp.SetParamStore(app.ConsensusParamsKeeper.ParamsStore)

	// ── Auth keeper ───────────────────────────────────────────────────────────
	app.AccountKeeper = authkeeper.NewAccountKeeper(
		cdc,
		runtime.NewKVStoreService(app.keys[authtypes.StoreKey]),
		authtypes.ProtoBaseAccount,
		maccPerms(),
		addresscodec.NewBech32Codec(Bech32PrefixAccAddr),
		Bech32PrefixAccAddr,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
	)

	// ── Bank keeper ───────────────────────────────────────────────────────────
	app.BankKeeper = bankkeeper.NewBaseKeeper(
		cdc,
		runtime.NewKVStoreService(app.keys[banktypes.StoreKey]),
		app.AccountKeeper,
		blockedAddresses(),
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
		logger,
	)

	// ── Staking keeper ────────────────────────────────────────────────────────
	app.StakingKeeper = stakingkeeper.NewKeeper(
		cdc,
		runtime.NewKVStoreService(app.keys[stakingtypes.StoreKey]),
		app.AccountKeeper,
		app.BankKeeper,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
		addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32ValidatorAddrPrefix()),
		addresscodec.NewBech32Codec(sdk.GetConfig().GetBech32ConsensusAddrPrefix()),
	)

	// ── Distribution keeper ───────────────────────────────────────────────────
	app.DistrKeeper = distrkeeper.NewKeeper(
		cdc,
		runtime.NewKVStoreService(app.keys[distrtypes.StoreKey]),
		app.AccountKeeper,
		app.BankKeeper,
		app.StakingKeeper,
		authtypes.FeeCollectorName,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
	)

	// ── Slashing keeper ───────────────────────────────────────────────────────
	app.SlashingKeeper = slashingkeeper.NewKeeper(
		cdc,
		legacyAmino,
		runtime.NewKVStoreService(app.keys[slashingtypes.StoreKey]),
		app.StakingKeeper,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
	)

	// ── Capability keeper ─────────────────────────────────────────────────────
	app.CapabilityKeeper = capabilitykeeper.NewKeeper(
		cdc,
		app.keys[capabilitytypes.StoreKey],
		app.memkeys[capabilitytypes.MemStoreKey],
	)
	scopedIBCKeeper := app.CapabilityKeeper.ScopeToModule(ibcexported.ModuleName)
	app.CapabilityKeeper.Seal()

	// ── Upgrade keeper ────────────────────────────────────────────────────────
	app.UpgradeKeeper = upgradekeeper.NewKeeper(
		map[int64]bool{},
		runtime.NewKVStoreService(app.keys[upgradetypes.StoreKey]),
		cdc,
		DefaultNodeHome,
		bApp,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
	)

	// ── IBC keeper ────────────────────────────────────────────────────────────
	app.IBCKeeper = ibckeeper.NewKeeper(
		cdc,
		app.keys[ibcexported.StoreKey],
		app.GetSubspace(ibcexported.ModuleName),
		app.StakingKeeper,
		app.UpgradeKeeper,
		scopedIBCKeeper,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String(),
	)

	// ── Ghost privacy keeper ──────────────────────────────────────────────────
	app.GhostKeeper = ghostkeeper.NewKeeper(
		cdc,
		app.keys[ghosttypes.StoreKey],
		app.BankKeeper,
		&ghostkeeper.StubZKVerifier{},
		logger,
	)

	// ── GhostGov keeper ───────────────────────────────────────────────────────
	aiOracleAddr := os.Getenv("GHOST_AI_ORACLE_ADDR")
	if aiOracleAddr == "" {
		aiOracleAddr = "ghost1qm5aqf0qy5mn3r0t5j2xm3m2m3m2m3m2m3m2qu" // placeholder
	}
	app.GhostGovKeeper = ghostgovkeeper.NewKeeper(
		cdc,
		app.keys[ghostgovtypes.StoreKey],
		ghostgovStakingAdapter{app.StakingKeeper},
		aiOracleAddr,
		logger,
	)

	// ── GST token keeper ──────────────────────────────────────────────────────
	app.GSTKeeper = gsttoken.NewKeeper(app.BankKeeper)

	// ── Module manager ────────────────────────────────────────────────────────
	app.mm = module.NewManager(
		auth.NewAppModule(cdc, app.AccountKeeper, authsim.RandomGenesisAccounts, app.GetSubspace(authtypes.ModuleName)),
		bank.NewAppModule(cdc, app.BankKeeper, app.AccountKeeper, app.GetSubspace(banktypes.ModuleName)),
		staking.NewAppModule(cdc, app.StakingKeeper, app.AccountKeeper, app.BankKeeper, app.GetSubspace(stakingtypes.ModuleName)),
		distribution.NewAppModule(cdc, app.DistrKeeper, app.AccountKeeper, app.BankKeeper, app.StakingKeeper, app.GetSubspace(distrtypes.ModuleName)),
		slashing.NewAppModule(cdc, app.SlashingKeeper, app.AccountKeeper, app.BankKeeper, app.StakingKeeper, app.GetSubspace(slashingtypes.ModuleName), app.interfaceRegistry),
		ibc.NewAppModule(app.IBCKeeper),
		ibctm.NewAppModule(),
		consensus.NewAppModule(cdc, app.ConsensusParamsKeeper),
		genutil.NewAppModule(app.AccountKeeper, app.StakingKeeper, bApp, txConfig),
		ghostmodule.NewAppModule(app.GhostKeeper),
		ghostgov.NewAppModule(app.GhostGovKeeper),
		gsttoken.NewAppModule(app.GSTKeeper),
	)

	// Set order for BeginBlock / EndBlock / InitGenesis.
	app.mm.SetOrderBeginBlockers(
		authtypes.ModuleName,
		banktypes.ModuleName,
		stakingtypes.ModuleName,
		distrtypes.ModuleName,
		slashingtypes.ModuleName,
		consensustypes.ModuleName,
		ibcexported.ModuleName,
		genutiltypes.ModuleName,
		ghosttypes.ModuleName,
		ghostgovtypes.ModuleName,
		gsttoken.ModuleName,
	)
	app.mm.SetOrderEndBlockers(
		stakingtypes.ModuleName,
		slashingtypes.ModuleName,
		consensustypes.ModuleName,
		ibcexported.ModuleName,
		genutiltypes.ModuleName,
		ghosttypes.ModuleName,
		ghostgovtypes.ModuleName,
		gsttoken.ModuleName,
	)
	app.mm.SetOrderInitGenesis(
		authtypes.ModuleName,
		banktypes.ModuleName,
		stakingtypes.ModuleName,
		distrtypes.ModuleName,
		slashingtypes.ModuleName,
		consensustypes.ModuleName,
		ibcexported.ModuleName,
		ibctransfertypes.ModuleName,
		ghosttypes.ModuleName,
		ghostgovtypes.ModuleName,
		gsttoken.ModuleName,
		genutiltypes.ModuleName, // must be last — processes gen_txs after all keepers are initialized
	)

	// ── AnteHandler ───────────────────────────────────────────────────────────
	anteHandler, err := NewAnteHandler(AnteHandlerOptions{
		AccountKeeper:   app.AccountKeeper,
		BankKeeper:      app.BankKeeper,
		SignModeHandler: txConfig.SignModeHandler(),
		GSTKeeper:       &app.GSTKeeper,
		IBCKeeper:       app.IBCKeeper,
	})
	if err != nil {
		panic("failed to create ante handler: " + err.Error())
	}
	bApp.SetAnteHandler(anteHandler)

	// ── Configure routes ──────────────────────────────────────────────────────
	app.configurator = module.NewConfigurator(cdc, bApp.MsgServiceRouter(), bApp.GRPCQueryRouter())
	app.mm.RegisterServices(app.configurator)

	// ── Wire ABCI handlers ────────────────────────────────────────────────────
	bApp.SetInitChainer(app.InitChainer)
	bApp.SetBeginBlocker(app.BeginBlocker)
	bApp.SetEndBlocker(app.EndBlocker)

	// ── Mount stores ──────────────────────────────────────────────────────────
	app.MountKVStores(storeKeys)
	app.MountTransientStores(tkeys)
	app.MountMemoryStores(memkeys)

	if loadLatest {
		if err := app.LoadLatestVersion(); err != nil {
			panic("failed to load latest version: " + err.Error())
		}
	}

	return app
}

// GetSubspace retrieves the params subspace for the given module.
func (app *GhostApp) GetSubspace(moduleName string) paramstypes.Subspace {
	subspace, _ := app.ParamsKeeper.GetSubspace(moduleName)
	return subspace
}

// InitChainer initialises the chain from genesis state.
func (app *GhostApp) InitChainer(ctx sdk.Context, req *abci.RequestInitChain) (*abci.ResponseInitChain, error) {
	var genesisState GenesisState
	if err := json.Unmarshal(req.AppStateBytes, &genesisState); err != nil {
		panic("invalid genesis state: " + err.Error())
	}
	return app.mm.InitGenesis(ctx, app.cdc, genesisState)
}

// BeginBlocker calls each module's BeginBlock hook.
func (app *GhostApp) BeginBlocker(ctx sdk.Context) (sdk.BeginBlock, error) {
	return app.mm.BeginBlock(ctx)
}

// EndBlocker calls each module's EndBlock hook.
func (app *GhostApp) EndBlocker(ctx sdk.Context) (sdk.EndBlock, error) {
	return app.mm.EndBlock(ctx)
}

// ExportAppStateAndValidators exports the application state and validators for
// use in a genesis file to restart or fork the chain.
func (app *GhostApp) ExportAppStateAndValidators(
	forZeroHeight bool,
	jailAllowedAddrs []string,
	modulesToExport []string,
) (servertypes.ExportedApp, error) {
	ctx := app.NewContextLegacy(true, cmtproto.Header{Height: app.LastBlockHeight()})
	validators, err := staking.WriteValidators(ctx, app.StakingKeeper)
	if err != nil {
		return servertypes.ExportedApp{}, err
	}
	appState, err := app.mm.ExportGenesisForModules(ctx, app.cdc, modulesToExport)
	if err != nil {
		return servertypes.ExportedApp{}, err
	}
	appStateJSON, err := json.Marshal(appState)
	if err != nil {
		return servertypes.ExportedApp{}, err
	}
	return servertypes.ExportedApp{
		AppState:        appStateJSON,
		Validators:      validators,
		Height:          app.LastBlockHeight(),
		ConsensusParams: app.GetConsensusParams(ctx),
	}, nil
}

// RegisterAPIRoutes registers API routes on the API server.
func (app *GhostApp) RegisterAPIRoutes(apiSvr *api.Server, apiConfig config.APIConfig) {
	// In cosmos-sdk v0.50 REST routes are served via gRPC gateway; no RegisterRESTRoutes.
	_ = apiSvr
	_ = apiConfig
}

// RegisterTxService registers the tx service on the gRPC router.
func (app *GhostApp) RegisterTxService(clientCtx client.Context) {
	authtx.RegisterTxService(app.BaseApp.GRPCQueryRouter(), clientCtx, app.BaseApp.Simulate, app.interfaceRegistry)
}

// RegisterTendermintService registers the CometBFT gRPC Query service.
func (app *GhostApp) RegisterTendermintService(clientCtx client.Context) {
	cmtApp := server.NewCometABCIWrapper(app)
	cmtservice.RegisterTendermintService(
		clientCtx,
		app.BaseApp.GRPCQueryRouter(),
		app.interfaceRegistry,
		cmtApp.Query,
	)
}

// RegisterNodeService registers the node gRPC service.
func (app *GhostApp) RegisterNodeService(clientCtx client.Context, cfg serverconfig.Config) {
	nodeservice.RegisterNodeService(clientCtx, app.BaseApp.GRPCQueryRouter(), cfg)
}

// LoadHeight loads application state at the given block height.
func (app *GhostApp) LoadHeight(height int64) error {
	return app.LoadVersion(height)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// maccPerms returns the module account permissions map.
func maccPerms() map[string][]string {
	return map[string][]string{
		authtypes.FeeCollectorName:     nil,
		distrtypes.ModuleName:          nil,
		stakingtypes.BondedPoolName:    {authtypes.Burner, authtypes.Staking},
		stakingtypes.NotBondedPoolName: {authtypes.Burner, authtypes.Staking},
		ibctransfertypes.ModuleName:    {authtypes.Minter, authtypes.Burner},
		gsttoken.ModuleName:            {authtypes.Minter, authtypes.Burner},
	}
}

// blockedAddresses returns the addresses that are blocked from direct sends.
func blockedAddresses() map[string]bool {
	return map[string]bool{
		authtypes.NewModuleAddress(authtypes.FeeCollectorName).String():     true,
		authtypes.NewModuleAddress(distrtypes.ModuleName).String():          true,
		authtypes.NewModuleAddress(stakingtypes.BondedPoolName).String():    true,
		authtypes.NewModuleAddress(stakingtypes.NotBondedPoolName).String(): true,
	}
}

// ghostgovStakingAdapter adapts the staking keeper to the ghostgov StakingKeeper interface.
type ghostgovStakingAdapter struct {
	k *stakingkeeper.Keeper
}

func (a ghostgovStakingAdapter) GetDelegatorBondedTokens(ctx context.Context, addr sdk.AccAddress) math.LegacyDec {
	// Sum all delegation amounts for this delegator.
	delegations, _ := a.k.GetAllDelegatorDelegations(ctx, addr)
	total := math.LegacyZeroDec()
	for _, del := range delegations {
		valAddr, err := sdk.ValAddressFromBech32(del.GetValidatorAddr())
		if err != nil {
			continue
		}
		val, err := a.k.GetValidator(ctx, valAddr)
		if err != nil {
			continue
		}
		tokens := val.TokensFromShares(del.GetShares())
		total = total.Add(tokens)
	}
	return total
}

func (a ghostgovStakingAdapter) TotalBondedTokens(ctx context.Context) math.Int {
	total, err := a.k.TotalBondedTokens(ctx)
	if err != nil {
		return math.ZeroInt()
	}
	return total
}

// EncodingConfig is the set of codecs used by the app.
type EncodingConfig struct {
	InterfaceRegistry codectypes.InterfaceRegistry
	Codec             codec.Codec
	TxConfig          client.TxConfig
	Amino             *codec.LegacyAmino
}

// MakeEncodingConfig creates an EncodingConfig for use in the root command.
func MakeEncodingConfig() EncodingConfig {
	ir, err := codectypes.NewInterfaceRegistryWithOptions(codectypes.InterfaceRegistryOptions{
		ProtoFiles: proto.HybridResolver,
		SigningOptions: signing.Options{
			AddressCodec:          addresscodec.NewBech32Codec(Bech32PrefixAccAddr),
			ValidatorAddressCodec: addresscodec.NewBech32Codec(Bech32PrefixAccAddr + "valoper"),
		},
	})
	if err != nil {
		panic(err)
	}
	cryptocodec.RegisterInterfaces(ir)
	cdc := codec.NewProtoCodec(ir)
	amino := codec.NewLegacyAmino()
	txConfig := authtx.NewTxConfig(cdc, authtx.DefaultSignModes)
	ModuleBasics.RegisterInterfaces(ir)
	ModuleBasics.RegisterLegacyAminoCodec(amino)
	return EncodingConfig{
		InterfaceRegistry: ir,
		Codec:             cdc,
		TxConfig:          txConfig,
		Amino:             amino,
	}
}

// GenesisState is the root genesis state that maps module names to their
// raw JSON genesis state.
type GenesisState map[string]json.RawMessage
