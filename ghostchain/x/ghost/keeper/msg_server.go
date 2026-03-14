package keeper

import (
	"context"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/ghostchain1/ghostchain/x/ghost/types"
)

// msgServer implements types.MsgServer by delegating to the Keeper.
type msgServer struct{ Keeper }

// NewMsgServerImpl returns an implementation of the ghost MsgServer interface.
func NewMsgServerImpl(k Keeper) types.MsgServer {
	return &msgServer{k}
}

// PrivateTransfer handles MsgPrivateTransfer messages.
func (m msgServer) PrivateTransfer(goCtx context.Context, msg *types.MsgPrivateTransfer) (*types.MsgPrivateTransferResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)

	sender, err := sdk.AccAddressFromBech32(msg.Sender)
	if err != nil {
		return nil, err
	}
	recipient, err := sdk.AccAddressFromBech32(msg.Recipient)
	if err != nil {
		return nil, err
	}

	if err := m.Keeper.PrivateTransfer(ctx, sender, recipient, msg.Amount, &msg.Proof); err != nil {
		ctx.EventManager().EmitEvent(sdk.NewEvent(
			types.EventTypeProofRejected,
			sdk.NewAttribute(types.AttributeKeySender, msg.Sender),
			sdk.NewAttribute(types.AttributeKeyProofType, msg.Proof.ProofType),
		))
		return nil, err
	}

	ctx.EventManager().EmitEvents(sdk.Events{
		sdk.NewEvent(
			types.EventTypeProofVerified,
			sdk.NewAttribute(types.AttributeKeyProofType, msg.Proof.ProofType),
			sdk.NewAttribute(types.AttributeKeyNullifierHash, msg.Proof.NullifierHex()),
		),
		sdk.NewEvent(
			types.EventTypePrivateTransfer,
			sdk.NewAttribute(types.AttributeKeySender, msg.Sender),
			sdk.NewAttribute(types.AttributeKeyRecipient, msg.Recipient),
			sdk.NewAttribute(types.AttributeKeyAmount, msg.Amount.String()),
		),
	})

	return &types.MsgPrivateTransferResponse{}, nil
}

// SubmitProof handles MsgSubmitProof messages.
func (m msgServer) SubmitProof(goCtx context.Context, msg *types.MsgSubmitProof) (*types.MsgSubmitProofResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)

	if err := m.Keeper.VerifyAndRecord(ctx, &msg.Proof); err != nil {
		return nil, err
	}

	ctx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeProofVerified,
		sdk.NewAttribute(types.AttributeKeyProofType, msg.Proof.ProofType),
		sdk.NewAttribute(types.AttributeKeyAccepted, "true"),
	))
	return &types.MsgSubmitProofResponse{}, nil
}
