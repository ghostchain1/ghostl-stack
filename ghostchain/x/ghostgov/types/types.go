package types

import (
	math "cosmossdk.io/math"
	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
)

const (
	ModuleName = "ghostgov"
	StoreKey   = ModuleName
	RouterKey  = ModuleName

	// AI oracle risk tiers — mirror the TypeScript policyEngine risk taxonomy.
	RiskTierLow    = "low"
	RiskTierMedium = "medium"
	RiskTierHigh   = "high"

	// Quorum thresholds per tier (as basis-points of total voting power).
	QuorumLow    = 3000 // 30 %
	QuorumMedium = 5000 // 50 %
	QuorumHigh   = 6700 // 67 %

	// Timelock delays per tier (in seconds).
	TimelockLow    = 24 * 3600        // 24 h
	TimelockMedium = 48 * 3600        // 48 h
	TimelockHigh   = 7 * 24 * 3600   // 7 d

	// Event types
	EventTypeProposalCreated  = "ghostgov_proposal_created"
	EventTypeAIRiskAssigned   = "ghostgov_ai_risk_assigned"
	EventTypeVoteCast         = "ghostgov_vote_cast"
	EventTypeProposalQueued   = "ghostgov_proposal_queued"
	EventTypeProposalExecuted = "ghostgov_proposal_executed"
	EventTypeProposalRejected = "ghostgov_proposal_rejected"

	AttributeKeyProposalID   = "proposal_id"
	AttributeKeyProposer     = "proposer"
	AttributeKeyRiskTier     = "risk_tier"
	AttributeKeyConstitution = "constitutional"
	AttributeKeyAmendment    = "amendment"
	AttributeKeyETA          = "eta"
)

// Sentinel errors for ghostgov.
var (
	ErrProposalNotFound     = errorsmod.Register(ModuleName, 2, "proposal not found")
	ErrAlreadyVoted         = errorsmod.Register(ModuleName, 3, "address has already voted")
	ErrProposalNotActive    = errorsmod.Register(ModuleName, 4, "proposal is not in voting period")
	ErrProposalNotQueued    = errorsmod.Register(ModuleName, 5, "proposal is not in queued state")
	ErrTimelockNotElapsed   = errorsmod.Register(ModuleName, 6, "timelock period has not elapsed")
	ErrInsufficientQuorum   = errorsmod.Register(ModuleName, 7, "proposal did not reach quorum")
	ErrAIVetoActive         = errorsmod.Register(ModuleName, 8, "AI oracle veto is active on this proposal")
	ErrAIRiskNotAssigned    = errorsmod.Register(ModuleName, 9, "AI oracle has not assigned a risk tier yet")
)

// ProposalStatus enumerates the lifecycle states of a GhostGov proposal.
type ProposalStatus string

const (
	StatusDepositPeriod ProposalStatus = "DEPOSIT_PERIOD"
	StatusVotingPeriod  ProposalStatus = "VOTING_PERIOD"
	StatusQueued        ProposalStatus = "QUEUED"
	StatusExecuted      ProposalStatus = "EXECUTED"
	StatusRejected      ProposalStatus = "REJECTED"
	StatusFailed        ProposalStatus = "FAILED"
)

// Proposal is the on-chain governance proposal record for GhostChain.
type Proposal struct {
	// ID is the unique sequential numeric identifier.
	ID uint64 `json:"id"`

	// Proposer is the bech32 address of the proposer.
	Proposer string `json:"proposer"`

	// Title and Description are human-readable content.
	Title       string `json:"title"`
	Description string `json:"description"`

	// Constitutional and Amendment flags mirror the Solidity GhostChainGovernor.
	Constitutional bool `json:"constitutional"`
	Amendment      bool `json:"amendment"`

	// AIRiskTier is set by the AI oracle ("low" | "medium" | "high").
	// Execution is gated on this being assigned.
	AIRiskTier string `json:"ai_risk_tier,omitempty"`

	// AIVeto, when true, prevents execution regardless of votes.
	AIVeto bool `json:"ai_veto"`

	// Status is the current lifecycle state.
	Status ProposalStatus `json:"status"`

	// Tally aggregates FOR/AGAINST/ABSTAIN voting power.
	Tally VoteTally `json:"tally"`

	// SubmitTime, VotingEndTime, ETA are nanosecond Unix timestamps.
	SubmitTime    int64 `json:"submit_time"`
	VotingEndTime int64 `json:"voting_end_time"`
	ETA           int64 `json:"eta,omitempty"`
}

// VoteTally accumulates voting power by option.
type VoteTally struct {
	ForPower     math.LegacyDec `json:"for_power"`
	AgainstPower math.LegacyDec `json:"against_power"`
	AbstainPower math.LegacyDec `json:"abstain_power"`
}

// VoteOption enumerates valid vote options.
type VoteOption string

const (
	VoteFor     VoteOption = "FOR"
	VoteAgainst VoteOption = "AGAINST"
	VoteAbstain VoteOption = "ABSTAIN"
)

// MsgCreateProposal creates a new governance proposal.
type MsgCreateProposal struct {
	Proposer       string `json:"proposer"`
	Title          string `json:"title"`
	Description    string `json:"description"`
	Constitutional bool   `json:"constitutional"`
	Amendment      bool   `json:"amendment"`
}

func (msg *MsgCreateProposal) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(msg.Proposer); err != nil {
		return errorsmod.Wrapf(errorsmod.Error{}, "invalid proposer address: %s", err)
	}
	if msg.Title == "" {
		return errorsmod.New(ModuleName, 100, "title must not be empty")
	}
	return nil
}
func (msg *MsgCreateProposal) GetSigners() []sdk.AccAddress {
	addr, _ := sdk.AccAddressFromBech32(msg.Proposer)
	return []sdk.AccAddress{addr}
}

// MsgVote casts a vote on a proposal.
type MsgVote struct {
	ProposalID uint64     `json:"proposal_id"`
	Voter      string     `json:"voter"`
	Option     VoteOption `json:"option"`
}

func (msg *MsgVote) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(msg.Voter); err != nil {
		return errorsmod.Wrapf(errorsmod.Error{}, "invalid voter address: %s", err)
	}
	switch msg.Option {
	case VoteFor, VoteAgainst, VoteAbstain:
	default:
		return errorsmod.New(ModuleName, 101, "invalid vote option")
	}
	return nil
}

func (msg *MsgVote) GetSigners() []sdk.AccAddress {
	addr, _ := sdk.AccAddressFromBech32(msg.Voter)
	return []sdk.AccAddress{addr}
}

// MsgAssignAIRisk is sent by the authorised AI oracle to assign a risk tier.
type MsgAssignAIRisk struct {
	// Oracle is the bech32 address of the trusted AI oracle account.
	Oracle     string `json:"oracle"`
	ProposalID uint64 `json:"proposal_id"`
	RiskTier   string `json:"risk_tier"`
	// Veto, when true, blocks execution of this proposal permanently.
	Veto bool `json:"veto"`
}

func (msg *MsgAssignAIRisk) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(msg.Oracle); err != nil {
		return errorsmod.Wrapf(errorsmod.Error{}, "invalid oracle address: %s", err)
	}
	switch msg.RiskTier {
	case RiskTierLow, RiskTierMedium, RiskTierHigh:
	default:
		return errorsmod.New(ModuleName, 102, "invalid risk tier")
	}
	return nil
}

func (msg *MsgAssignAIRisk) GetSigners() []sdk.AccAddress {
	addr, _ := sdk.AccAddressFromBech32(msg.Oracle)
	return []sdk.AccAddress{addr}
}

// MsgExecuteProposal executes a queued proposal after its timelock has elapsed.
type MsgExecuteProposal struct {
	Executor   string `json:"executor"`
	ProposalID uint64 `json:"proposal_id"`
}

func (msg *MsgExecuteProposal) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(msg.Executor); err != nil {
		return errorsmod.Wrapf(errorsmod.Error{}, "invalid executor address: %s", err)
	}
	return nil
}

func (msg *MsgExecuteProposal) GetSigners() []sdk.AccAddress {
	addr, _ := sdk.AccAddressFromBech32(msg.Executor)
	return []sdk.AccAddress{addr}
}
