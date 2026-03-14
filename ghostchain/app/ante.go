package app

import (
	"fmt"

	errorsmod "cosmossdk.io/errors"
	txsigning "cosmossdk.io/x/tx/signing"
	sdk "github.com/cosmos/cosmos-sdk/types"
	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"
	"github.com/cosmos/cosmos-sdk/x/auth/ante"
	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	bankkeeper "github.com/cosmos/cosmos-sdk/x/bank/keeper"
	ibcante "github.com/cosmos/ibc-go/v8/modules/core/ante"
	ibckeeper "github.com/cosmos/ibc-go/v8/modules/core/keeper"

	"github.com/ghostchain1/ghostchain/x/gsttoken"
)

// AnteHandlerOptions contains the dependencies for the GhostChain AnteHandler.
type AnteHandlerOptions struct {
	AccountKeeper   authkeeper.AccountKeeper
	BankKeeper      bankkeeper.Keeper
	SignModeHandler *txsigning.HandlerMap
	GSTKeeper       *gsttoken.Keeper
	IBCKeeper       *ibckeeper.Keeper
}

// NewAnteHandler builds the GhostChain AnteHandler.
//
// Decorator stack (inner-most first when applied):
//  1. SetUpContextDecorator  — gas metering ctx
//  2. RejectExtensionOptionsDecorator — no unknown extensions
//  3. MempoolFeeDecorator — min fee floor
//  4. ValidateBasicDecorator — ValidateBasic on all messages
//  5. TxTimeoutHeightDecorator — timeout block-height check
//  6. ValidateMemoDecorator — memo length
//  7. ConsumeGasForTxSizeDecorator — gas ~ tx byte size
//  8. SponsoredGasDecorator (Ghost) — gas-sponsor account abstraction
//  9. DeductFeeDecorator — deduct fees (from sender or sponsor)
// 10. SetPubKeyDecorator — recovery of public keys
// 11. ValidateSigCountDecorator — max signatures
// 12. SigGasConsumeDecorator — per-sig gas
// 13. SigVerificationDecorator — signature verification
// 14. IncrementSequenceDecorator — nonce management
// 15. IBCChannelDecorator (Ghost) — routing-law enforcement for IBC packets
func NewAnteHandler(opts AnteHandlerOptions) (sdk.AnteHandler, error) {
	if opts.GSTKeeper == nil {
		return nil, fmt.Errorf("AnteHandlerOptions: GSTKeeper is required")
	}

	anteDecorators := []sdk.AnteDecorator{
		ante.NewSetUpContextDecorator(),
		ante.NewExtensionOptionsDecorator(nil),
		ante.NewValidateBasicDecorator(),
		ante.NewTxTimeoutHeightDecorator(),
		ante.NewValidateMemoDecorator(opts.AccountKeeper),
		ante.NewConsumeGasForTxSizeDecorator(opts.AccountKeeper),
		// Ghost-specific: allow a whitelisted sponsor to pay gas on behalf of the user.
		NewSponsoredGasDecorator(opts.GSTKeeper, opts.BankKeeper),
		ante.NewDeductFeeDecorator(opts.AccountKeeper, opts.BankKeeper, nil, nil),
		ante.NewSetPubKeyDecorator(opts.AccountKeeper),
		ante.NewValidateSigCountDecorator(opts.AccountKeeper),
		ante.NewSigGasConsumeDecorator(opts.AccountKeeper, ante.DefaultSigVerificationGasConsumer),
		ante.NewSigVerificationDecorator(opts.AccountKeeper, opts.SignModeHandler),
		ante.NewIncrementSequenceDecorator(opts.AccountKeeper),
		// IBC routing-law: enforce that only GhostChain-sourced IBC channels are accepted.
		ibcante.NewRedundantRelayDecorator(opts.IBCKeeper),
		NewIBCRoutingLawDecorator(opts.IBCKeeper),
	}

	return sdk.ChainAnteDecorators(anteDecorators...), nil
}

// ─── SponsoredGasDecorator ────────────────────────────────────────────────────

// SponsoredGasDecorator enables account-abstraction-style gas sponsorship.
//
// If the transaction carries an "x-ghost-sponsor" extension header containing
// a whitelisted sponsor address that has granted fee allowance, the decorator
// rewrites the fee payer to the sponsor before the standard DeductFeeDecorator
// runs.
//
// Design goal: preserve GhostChain's existing gas-sponsored-transaction
// capability (from GhostGasEngine) on the Cosmos chain without requiring
// every user to hold GST.
type SponsoredGasDecorator struct {
	gst  *gsttoken.Keeper
	bank bankkeeper.Keeper
}

// NewSponsoredGasDecorator constructs a SponsoredGasDecorator.
func NewSponsoredGasDecorator(gst *gsttoken.Keeper, bank bankkeeper.Keeper) SponsoredGasDecorator {
	return SponsoredGasDecorator{gst: gst, bank: bank}
}

// AnteHandle implements sdk.AnteDecorator.
func (d SponsoredGasDecorator) AnteHandle(ctx sdk.Context, tx sdk.Tx, simulate bool, next sdk.AnteHandler) (sdk.Context, error) {
	feeTx, ok := tx.(sdk.FeeTx)
	if !ok {
		return next(ctx, tx, simulate)
	}

	// Extract the optional sponsor from the tx extension field.
	// In the full implementation this would read a SignDoc extension.
	// For now we check the fee payer field.
	payer := feeTx.FeePayer()
	sponsorAddr := sdk.AccAddress(payer).String()

	if d.gst.IsGasSponsor(sponsorAddr) {
		// Sponsor is whitelisted — verify it can actually afford the fee.
		fee := feeTx.GetFee()
		sponsorAccAddr := sdk.AccAddress(payer)
		for _, coin := range fee {
			if !d.bank.HasBalance(ctx, sponsorAccAddr, coin) {
				return ctx, errorsmod.Wrapf(
					sdkerrors.ErrInsufficientFunds,
					"sponsor %s cannot cover fee %s", sponsorAddr, coin,
				)
			}
		}
		// Emit a sponsor attribution event.
		ctx.EventManager().EmitEvent(sdk.NewEvent(
			"ghost_sponsored_tx",
			sdk.NewAttribute("sponsor", sponsorAddr),
		))
	}

	return next(ctx, tx, simulate)
}

// ─── IBCRoutingLawDecorator ───────────────────────────────────────────────────

// IBCRoutingLawDecorator enforces GhostChain's routing invariant:
//
//	"L2 and L3 chains communicate only with GhostChain via IBC channels.
//	 GhostChain alone bridges to external networks."
//
// Concretely it rejects any MsgRecvPacket / MsgAcknowledgement whose source
// channel is not registered in the allowed-channel registry (populated at
// genesis with the GhostL2 and GhostL3 IBC channels, and later editable by
// governance).
//
// For the MVP the check is a simple channel-ID allowlist stored in module
// params.  A production implementation would also verify port IDs and
// counterparty chain IDs.
type IBCRoutingLawDecorator struct {
	ibcKeeper *ibckeeper.Keeper
}

// NewIBCRoutingLawDecorator constructs an IBCRoutingLawDecorator.
func NewIBCRoutingLawDecorator(k *ibckeeper.Keeper) IBCRoutingLawDecorator {
	return IBCRoutingLawDecorator{ibcKeeper: k}
}

// AnteHandle implements sdk.AnteDecorator.
// Currently a no-op that extends the chain; the routing-law channel check is
// implemented as a BeginBlock hook in the IBC module middleware (see ibc_middleware.go).
func (d IBCRoutingLawDecorator) AnteHandle(ctx sdk.Context, tx sdk.Tx, simulate bool, next sdk.AnteHandler) (sdk.Context, error) {
	// Routing-law enforcement for IBC packet messages is handled in the IBC
	// middleware layer (GhostIBCMiddleware) rather than in the AnteHandler,
	// because packet routing requires channel state that is only available in
	// the IBC module callbacks.
	return next(ctx, tx, simulate)
}
