package types

import "context"

// MsgServer defines the ghostgov module message server interface.
type MsgServer interface {
	CreateProposal(ctx context.Context, msg *MsgCreateProposal) (*MsgCreateProposalResponse, error)
	Vote(ctx context.Context, msg *MsgVote) (*MsgVoteResponse, error)
	AssignAIRisk(ctx context.Context, msg *MsgAssignAIRisk) (*MsgAssignAIRiskResponse, error)
	ExecuteProposal(ctx context.Context, msg *MsgExecuteProposal) (*MsgExecuteProposalResponse, error)
}

// Response types
type MsgCreateProposalResponse struct{ ProposalID uint64 }
type MsgVoteResponse struct{}
type MsgAssignAIRiskResponse struct{}
type MsgExecuteProposalResponse struct{}
