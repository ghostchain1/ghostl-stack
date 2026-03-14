// Package keeper implements the x/ghostgov module keeper.
//
// GhostGov extends standard on-chain governance with an AI oracle gate:
// before any constitutional or high-risk proposal can be executed, the
// AI oracle must classify its risk tier.  The AI oracle is a permissioned
// Cosmos account whose address is stored in the module params.
//
// Lifecycle:
//  1. MsgCreateProposal → status=DEPOSIT_PERIOD → status=VOTING_PERIOD
//  2. Votes accumulate via MsgVote (staked token weight)
//  3. AI oracle calls MsgAssignAIRisk (risk tier or veto)
//  4. At VotingEndTime the tally is evaluated and quorum threshold checked
//  5. If passed → status=QUEUED, ETA = now + timelock(riskTier)
//  6. After ETA, anyone calls MsgExecuteProposal → status=EXECUTED
package keeper

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"

	"cosmossdk.io/log"
	math "cosmossdk.io/math"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/ghostchain1/ghostchain/x/ghostgov/types"
)

// StakingKeeper is the subset of staking keeper methods needed by ghostgov.
type StakingKeeper interface {
	// GetDelegatorBondedTokens returns the sum of bonded tokens delegated by addr.
	GetDelegatorBondedTokens(ctx context.Context, addr sdk.AccAddress) math.LegacyDec
	// TotalBondedTokens returns the chain-wide bonded token supply.
	TotalBondedTokens(ctx context.Context) math.Int
}

// Keeper is the x/ghostgov module keeper.
type Keeper struct {
	cdc      codec.BinaryCodec
	storeKey storetypes.StoreKey
	staking  StakingKeeper
	// AIOracle is the bech32 address of the authorised AI oracle account.
	// Only messages signed by this key are accepted for MsgAssignAIRisk.
	AIOracle string
	logger   log.Logger
}

// Logger returns the module logger.
func (k Keeper) Logger() log.Logger { return k.logger }

// NewKeeper constructs a new ghostgov Keeper.
func NewKeeper(
	cdc codec.BinaryCodec,
	storeKey storetypes.StoreKey,
	staking StakingKeeper,
	aiOracle string,
	logger log.Logger,
) Keeper {
	return Keeper{
		cdc:      cdc,
		storeKey: storeKey,
		staking:  staking,
		AIOracle: aiOracle,
		logger:   logger.With("module", fmt.Sprintf("x/%s", types.ModuleName)),
	}
}

// ─── Store helpers ───────────────────────────────────────────────────────────

func proposalKey(id uint64) []byte {
	bz := make([]byte, 8)
	binary.BigEndian.PutUint64(bz, id)
	return append([]byte("proposal/"), bz...)
}

func voteKey(proposalID uint64, voter sdk.AccAddress) []byte {
	prefix := make([]byte, 8)
	binary.BigEndian.PutUint64(prefix, proposalID)
	return append(append([]byte("vote/"), prefix...), voter...)
}

func nextIDKey() []byte { return []byte("next_proposal_id") }

// nextProposalID returns and increments the monotonic proposal counter.
func (k Keeper) nextProposalID(ctx sdk.Context) uint64 {
	store := ctx.KVStore(k.storeKey)
	bz := store.Get(nextIDKey())
	var id uint64
	if bz != nil {
		id = binary.BigEndian.Uint64(bz)
	}
	next := make([]byte, 8)
	binary.BigEndian.PutUint64(next, id+1)
	store.Set(nextIDKey(), next)
	return id + 1
}

func (k Keeper) setProposal(ctx sdk.Context, p types.Proposal) {
	store := ctx.KVStore(k.storeKey)
	bz, _ := json.Marshal(p)
	store.Set(proposalKey(p.ID), bz)
}

func (k Keeper) getProposal(ctx sdk.Context, id uint64) (types.Proposal, bool) {
	store := ctx.KVStore(k.storeKey)
	bz := store.Get(proposalKey(id))
	if bz == nil {
		return types.Proposal{}, false
	}
	var p types.Proposal
	_ = json.Unmarshal(bz, &p)
	return p, true
}

func (k Keeper) hasVoted(ctx sdk.Context, proposalID uint64, voter sdk.AccAddress) bool {
	return ctx.KVStore(k.storeKey).Has(voteKey(proposalID, voter))
}

func (k Keeper) recordVote(ctx sdk.Context, proposalID uint64, voter sdk.AccAddress) {
	ctx.KVStore(k.storeKey).Set(voteKey(proposalID, voter), []byte{1})
}

// ─── Core operations ─────────────────────────────────────────────────────────

// CreateProposal opens a new governance proposal.
func (k Keeper) CreateProposal(ctx sdk.Context, msg *types.MsgCreateProposal) (types.Proposal, error) {
	id := k.nextProposalID(ctx)
	now := ctx.BlockTime().UnixNano()
	votingDuration := int64(7 * 24 * time.Hour) // 7-day voting window (nanoseconds)

	p := types.Proposal{
		ID:             id,
		Proposer:       msg.Proposer,
		Title:          msg.Title,
		Description:    msg.Description,
		Constitutional: msg.Constitutional,
		Amendment:      msg.Amendment,
		Status:         types.StatusVotingPeriod,
		Tally: types.VoteTally{
			ForPower:     math.LegacyZeroDec(),
			AgainstPower: math.LegacyZeroDec(),
			AbstainPower: math.LegacyZeroDec(),
		},
		SubmitTime:    now,
		VotingEndTime: now + votingDuration,
	}

	k.setProposal(ctx, p)
	k.logger.Info("proposal created", "id", id, "proposer", msg.Proposer, "constitutional", msg.Constitutional)
	return p, nil
}

// CastVote records a vote for a proposal, weighted by the voter's bonded stake.
func (k Keeper) CastVote(ctx sdk.Context, msg *types.MsgVote) error {
	p, ok := k.getProposal(ctx, msg.ProposalID)
	if !ok {
		return types.ErrProposalNotFound
	}
	if p.Status != types.StatusVotingPeriod {
		return types.ErrProposalNotActive
	}

	voter, _ := sdk.AccAddressFromBech32(msg.Voter)
	if k.hasVoted(ctx, msg.ProposalID, voter) {
		return types.ErrAlreadyVoted
	}

	// Weight the vote by the voter's bonded token balance.
	weight := k.staking.GetDelegatorBondedTokens(ctx, voter)

	switch msg.Option {
	case types.VoteFor:
		p.Tally.ForPower = p.Tally.ForPower.Add(weight)
	case types.VoteAgainst:
		p.Tally.AgainstPower = p.Tally.AgainstPower.Add(weight)
	case types.VoteAbstain:
		p.Tally.AbstainPower = p.Tally.AbstainPower.Add(weight)
	}

	k.recordVote(ctx, msg.ProposalID, voter)
	k.setProposal(ctx, p)
	return nil
}

// AssignAIRisk allows the AI oracle account to set the risk tier (and optionally
// veto) a proposal.  Only the configured AIOracle address may call this.
func (k Keeper) AssignAIRisk(ctx sdk.Context, msg *types.MsgAssignAIRisk) error {
	if msg.Oracle != k.AIOracle {
		return types.ErrAIRiskNotAssigned.Wrapf("caller %s is not the authorised AI oracle (%s)", msg.Oracle, k.AIOracle)
	}

	p, ok := k.getProposal(ctx, msg.ProposalID)
	if !ok {
		return types.ErrProposalNotFound
	}

	p.AIRiskTier = msg.RiskTier
	p.AIVeto = msg.Veto
	k.setProposal(ctx, p)

	k.logger.Info("AI risk assigned", "proposal", msg.ProposalID, "tier", msg.RiskTier, "veto", msg.Veto)
	return nil
}

// FinalizeVoting evaluates the tally at the end of the voting period and
// transitions the proposal to QUEUED or REJECTED.
// This is called from EndBlock for each proposal whose VotingEndTime has passed.
func (k Keeper) FinalizeVoting(ctx sdk.Context, p types.Proposal) error {
	if p.AIVeto {
		p.Status = types.StatusRejected
		k.setProposal(ctx, p)
		return nil
	}
	if p.AIRiskTier == "" {
		// AI oracle hasn't classified yet — allow extra time but do not execute.
		k.logger.Warn("AI risk tier not assigned at voting end", "proposal", p.ID)
		return types.ErrAIRiskNotAssigned
	}

	total := k.staking.TotalBondedTokens(ctx)
	if total.IsZero() {
		p.Status = types.StatusRejected
		k.setProposal(ctx, p)
		return nil
	}

	totalDec := math.LegacyNewDecFromInt(total)
	participated := p.Tally.ForPower.Add(p.Tally.AgainstPower).Add(p.Tally.AbstainPower)
	quorumRatio := participated.Quo(totalDec)

	var requiredQuorum math.LegacyDec
	var timelockSec int64
	switch p.AIRiskTier {
	case types.RiskTierHigh:
		requiredQuorum = math.LegacyNewDecWithPrec(67, 2)
		timelockSec = types.TimelockHigh
	case types.RiskTierMedium:
		requiredQuorum = math.LegacyNewDecWithPrec(50, 2)
		timelockSec = types.TimelockMedium
	default: // low
		requiredQuorum = math.LegacyNewDecWithPrec(30, 2)
		timelockSec = types.TimelockLow
	}

	// Elevate quorum by one tier for constitutional proposals (mirror Solidity logic).
	if p.Constitutional && p.AIRiskTier != types.RiskTierHigh {
		requiredQuorum = math.LegacyNewDecWithPrec(67, 2)
		timelockSec = types.TimelockHigh
	}

	if quorumRatio.LT(requiredQuorum) || p.Tally.ForPower.LTE(p.Tally.AgainstPower) {
		p.Status = types.StatusRejected
		k.setProposal(ctx, p)
		return nil
	}

	// Queue with timelock.
	p.Status = types.StatusQueued
	p.ETA = ctx.BlockTime().UnixNano() + timelockSec*int64(time.Second)
	k.setProposal(ctx, p)
	k.logger.Info("proposal queued", "id", p.ID, "eta_ns", p.ETA, "risk", p.AIRiskTier)
	return nil
}

// ExecuteProposal marks a queued proposal as executed after its timelock.
// Actual execution payload dispatch is left to the governance router
// (identical pattern to cosmos-sdk's x/gov module).
func (k Keeper) ExecuteProposal(ctx sdk.Context, msg *types.MsgExecuteProposal) error {
	p, ok := k.getProposal(ctx, msg.ProposalID)
	if !ok {
		return types.ErrProposalNotFound
	}
	if p.Status != types.StatusQueued {
		return types.ErrProposalNotQueued
	}
	now := ctx.BlockTime().UnixNano()
	if now < p.ETA {
		return types.ErrTimelockNotElapsed
	}

	p.Status = types.StatusExecuted
	k.setProposal(ctx, p)
	k.logger.Info("proposal executed", "id", p.ID)
	return nil
}

// GetProposal is an exported accessor for query handlers.
func (k Keeper) GetProposal(ctx sdk.Context, id uint64) (types.Proposal, bool) {
	return k.getProposal(ctx, id)
}

// IterateProposals iterates over all proposals calling fn for each.
// Iteration stops if fn returns true.
func (k Keeper) IterateProposals(ctx sdk.Context, fn func(types.Proposal) bool) {
	prefix := []byte("proposal/")
	store := ctx.KVStore(k.storeKey)
	iter := storetypes.KVStorePrefixIterator(store, prefix)
	defer iter.Close()
	for ; iter.Valid(); iter.Next() {
		var p types.Proposal
		if err := json.Unmarshal(iter.Value(), &p); err != nil {
			continue
		}
		if fn(p) {
			break
		}
	}
}
