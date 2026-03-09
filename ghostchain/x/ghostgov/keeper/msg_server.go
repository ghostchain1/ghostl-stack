package keeper

import (
	"context"
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/ghostchain1/ghostchain/x/ghostgov/types"
)

type msgServer struct{ Keeper }

// NewMsgServerImpl returns an implementation of the ghostgov MsgServer.
func NewMsgServerImpl(k Keeper) types.MsgServer {
	return &msgServer{k}
}

func (m msgServer) CreateProposal(goCtx context.Context, msg *types.MsgCreateProposal) (*types.MsgCreateProposalResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}
	p, err := m.Keeper.CreateProposal(ctx, msg)
	if err != nil {
		return nil, err
	}
	ctx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeProposalCreated,
		sdk.NewAttribute(types.AttributeKeyProposalID, fmt.Sprint(p.ID)),
		sdk.NewAttribute(types.AttributeKeyProposer, msg.Proposer),
		sdk.NewAttribute(types.AttributeKeyConstitution, fmt.Sprint(msg.Constitutional)),
		sdk.NewAttribute(types.AttributeKeyAmendment, fmt.Sprint(msg.Amendment)),
	))
	return &types.MsgCreateProposalResponse{ProposalID: p.ID}, nil
}

func (m msgServer) Vote(goCtx context.Context, msg *types.MsgVote) (*types.MsgVoteResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}
	if err := m.Keeper.CastVote(ctx, msg); err != nil {
		return nil, err
	}
	ctx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeVoteCast,
		sdk.NewAttribute(types.AttributeKeyProposalID, fmt.Sprint(msg.ProposalID)),
	))
	return &types.MsgVoteResponse{}, nil
}

func (m msgServer) AssignAIRisk(goCtx context.Context, msg *types.MsgAssignAIRisk) (*types.MsgAssignAIRiskResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}
	if err := m.Keeper.AssignAIRisk(ctx, msg); err != nil {
		return nil, err
	}
	ctx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeAIRiskAssigned,
		sdk.NewAttribute(types.AttributeKeyProposalID, fmt.Sprint(msg.ProposalID)),
		sdk.NewAttribute(types.AttributeKeyRiskTier, msg.RiskTier),
	))
	return &types.MsgAssignAIRiskResponse{}, nil
}

func (m msgServer) ExecuteProposal(goCtx context.Context, msg *types.MsgExecuteProposal) (*types.MsgExecuteProposalResponse, error) {
	ctx := sdk.UnwrapSDKContext(goCtx)
	if err := msg.ValidateBasic(); err != nil {
		return nil, err
	}
	if err := m.Keeper.ExecuteProposal(ctx, msg); err != nil {
		return nil, err
	}
	ctx.EventManager().EmitEvent(sdk.NewEvent(
		types.EventTypeProposalExecuted,
		sdk.NewAttribute(types.AttributeKeyProposalID, fmt.Sprint(msg.ProposalID)),
	))
	return &types.MsgExecuteProposalResponse{}, nil
}
