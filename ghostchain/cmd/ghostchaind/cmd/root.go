// Package cmd wires the ghostchaind cobra command tree.
package cmd

import (
	"errors"
	"io"
	"os"

	dbm "github.com/cosmos/cosmos-db"
	"cosmossdk.io/log"
	confixcmd "cosmossdk.io/tools/confix/cmd"
	cmtcfg "github.com/cometbft/cometbft/config"
	cmtcli "github.com/cometbft/cometbft/libs/cli"
	"github.com/cosmos/cosmos-sdk/client"
	"github.com/cosmos/cosmos-sdk/client/config"
	"github.com/cosmos/cosmos-sdk/client/debug"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/client/keys"
	"github.com/cosmos/cosmos-sdk/server"
	serverconfig "github.com/cosmos/cosmos-sdk/server/config"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	authtypes "github.com/cosmos/cosmos-sdk/x/auth/types"
	"github.com/cosmos/cosmos-sdk/x/crisis"
	genutilcli "github.com/cosmos/cosmos-sdk/x/genutil/client/cli"
	"github.com/spf13/cobra"

	"github.com/ghostchain1/ghostchain/app"
)

// NewRootCmd builds the ghostchaind root command.
func NewRootCmd() *cobra.Command {
	// bech32 prefixes are set and sealed in app.init(); no need to repeat here.

	encodingConfig := app.MakeEncodingConfig()

	initClientCtx := client.Context{}.
		WithCodec(encodingConfig.Codec).
		WithInterfaceRegistry(encodingConfig.InterfaceRegistry).
		WithTxConfig(encodingConfig.TxConfig).
		WithLegacyAmino(encodingConfig.Amino).
		WithInput(os.Stdin).
		WithAccountRetriever(authtypes.AccountRetriever{}).
		WithHomeDir(app.DefaultNodeHome).
		WithViper("GHOSTCHAIN")

	rootCmd := &cobra.Command{
		Use:   "ghostchaind",
		Short: "GhostChain Daemon — Cosmos SDK sovereign chain",
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			cmd.SetOut(cmd.OutOrStdout())
			cmd.SetErr(cmd.ErrOrStderr())
			initClientCtx, err := client.ReadPersistentCommandFlags(initClientCtx, cmd.Flags())
			if err != nil {
				return err
			}
			initClientCtx, err = config.ReadFromClientConfig(initClientCtx)
			if err != nil {
				return err
			}
			if err := client.SetCmdClientContextHandler(initClientCtx, cmd); err != nil {
				return err
			}
			customAppTemplate, customAppConfig := initAppConfig()
			return server.InterceptConfigsPreRunHandler(cmd, customAppTemplate, customAppConfig, cmtcfg.DefaultConfig())
		},
	}

	initRootCmd(rootCmd, encodingConfig)
	return rootCmd
}

func initRootCmd(rootCmd *cobra.Command, encodingConfig app.EncodingConfig) {
	rootCmd.AddCommand(
		genutilcli.InitCmd(app.ModuleBasics, app.DefaultNodeHome),
		debug.Cmd(),
		confixcmd.ConfigCommand(),
		cmtcli.NewCompletionCmd(rootCmd, true),
	)

	server.AddCommands(rootCmd, app.DefaultNodeHome, newApp, appExport, addModuleInitFlags)

	rootCmd.AddCommand(
		server.StatusCommand(),
		genutilcli.Commands(encodingConfig.TxConfig, app.ModuleBasics, app.DefaultNodeHome),
		keys.Commands(),
	)
}

func addModuleInitFlags(startCmd *cobra.Command) {
	crisis.AddModuleInitFlags(startCmd)
}

// newApp creates the GhostApp for server commands.
func newApp(logger log.Logger, db dbm.DB, traceStore io.Writer, appOpts servertypes.AppOptions) servertypes.Application {
	return app.NewGhostApp(
		logger,
		db,
		traceStore,
		true,
		appOpts,
		server.DefaultBaseappOptions(appOpts)...,
	)
}

// appExport creates a GhostApp for genesis export.
func appExport(
	logger log.Logger,
	db dbm.DB,
	traceStore io.Writer,
	height int64,
	forZeroHeight bool,
	jailAllowedAddrs []string,
	appOpts servertypes.AppOptions,
	modulesToExport []string,
) (servertypes.ExportedApp, error) {
	homePath, ok := appOpts.Get(flags.FlagHome).(string)
	if !ok || homePath == "" {
		return servertypes.ExportedApp{}, errors.New("application home dir not found")
	}

	ghostApp := app.NewGhostApp(
		logger,
		db,
		traceStore,
		false,
		appOpts,
	)
	if height != -1 {
		if err := ghostApp.LoadHeight(height); err != nil {
			return servertypes.ExportedApp{}, err
		}
	}
	return ghostApp.ExportAppStateAndValidators(forZeroHeight, jailAllowedAddrs, modulesToExport)
}

// initAppConfig returns a customised app configuration template and values.
func initAppConfig() (string, interface{}) {
	type CustomAppConfig struct {
		serverconfig.Config
	}
	srvCfg := serverconfig.DefaultConfig()
	srvCfg.MinGasPrices = "0ugst"
	srvCfg.API.Enable = true
	srvCfg.API.Swagger = true
	srvCfg.GRPC.Enable = true

	customAppConfig := CustomAppConfig{Config: *srvCfg}
	return serverconfig.DefaultConfigTemplate, customAppConfig
}
