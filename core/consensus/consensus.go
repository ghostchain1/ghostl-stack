// Package consensus implements GhostChain Proof-of-Stake consensus.
// Validator set management, block finality voting, and slashing conditions.
package consensus

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"sync"
	"time"
)

// ChainID constants
const (
	ChainIDL1 = 14000101
	ChainIDL2 = 901
	ChainIDL3 = 903
)

// VoteThreshold is the fraction of stake required for finality (2/3 + 1)
const VoteThreshold = 2.0 / 3.0

// Validator represents a GhostChain PoS validator
type Validator struct {
	Address    [20]byte
	PublicKey  [64]byte
	Stake      uint64  // GST wei (10^18 units)
	Commission uint8   // basis points (0-10000)
	Jailed     bool
	JailUntil  int64   // unix seconds
}

// ValidatorSet is the active validator set for a round
type ValidatorSet struct {
	mu         sync.RWMutex
	validators []*Validator
	totalStake uint64
}

// NewValidatorSet creates an empty validator set
func NewValidatorSet() *ValidatorSet {
	return &ValidatorSet{}
}

// Add inserts or replaces a validator in the set
func (vs *ValidatorSet) Add(v *Validator) {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	for i, existing := range vs.validators {
		if existing.Address == v.Address {
			vs.totalStake -= existing.Stake
			vs.validators[i] = v
			vs.totalStake += v.Stake
			return
		}
	}

	vs.validators = append(vs.validators, v)
	vs.totalStake += v.Stake
}

// Remove removes a validator by address
func (vs *ValidatorSet) Remove(addr [20]byte) {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	for i, v := range vs.validators {
		if v.Address == addr {
			vs.totalStake -= v.Stake
			vs.validators = append(vs.validators[:i], vs.validators[i+1:]...)
			return
		}
	}
}

// ActiveValidators returns non-jailed validators sorted by stake descending
func (vs *ValidatorSet) ActiveValidators() []*Validator {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	now := time.Now().Unix()
	active := make([]*Validator, 0, len(vs.validators))
	for _, v := range vs.validators {
		if !v.Jailed || v.JailUntil < now {
			active = append(active, v)
		}
	}

	sort.Slice(active, func(i, j int) bool {
		return active[i].Stake > active[j].Stake
	})

	return active
}

// TotalActiveStake returns the sum of stake across active validators
func (vs *ValidatorSet) TotalActiveStake() uint64 {
	active := vs.ActiveValidators()
	var total uint64
	for _, v := range active {
		total += v.Stake
	}
	return total
}

// Jail marks a validator as jailed until the given unix timestamp
func (vs *ValidatorSet) Jail(addr [20]byte, until int64) error {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	for _, v := range vs.validators {
		if v.Address == addr {
			v.Jailed    = true
			v.JailUntil = until
			return nil
		}
	}
	return errors.New("consensus: validator not found")
}

// ─── Vote ─────────────────────────────────────────────────────────────────────

// VoteType is the type of consensus vote
type VoteType uint8

const (
	VotePrevote   VoteType = 0
	VotePrecommit VoteType = 1
)

// Vote is a signed consensus vote from a validator
type Vote struct {
	Type      VoteType
	Height    uint64
	Round     uint32
	BlockHash [32]byte
	Validator [20]byte
	Signature []byte
}

// VoteSet collects votes for a single height+round+type
type VoteSet struct {
	mu         sync.RWMutex
	height     uint64
	round      uint32
	voteType   VoteType
	validators *ValidatorSet
	votes      map[[20]byte]*Vote
}

// NewVoteSet creates a new vote collection
func NewVoteSet(height uint64, round uint32, vt VoteType, vs *ValidatorSet) *VoteSet {
	return &VoteSet{
		height:     height,
		round:      round,
		voteType:   vt,
		validators: vs,
		votes:      make(map[[20]byte]*Vote),
	}
}

// Add adds a vote to the set (idempotent for identical votes)
func (vs *VoteSet) Add(vote *Vote) error {
	if vote.Height != vs.height || vote.Round != vs.round || vote.Type != vs.voteType {
		return errors.New("consensus: vote does not match vote set params")
	}

	vs.mu.Lock()
	defer vs.mu.Unlock()

	vs.votes[vote.Validator] = vote
	return nil
}

// HasQuorum returns true if >2/3 of total active stake has voted for blockHash
func (vs *VoteSet) HasQuorum(blockHash [32]byte) bool {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	totalStake := vs.validators.TotalActiveStake()
	if totalStake == 0 {
		return false
	}

	var votedStake uint64
	for _, vote := range vs.votes {
		if vote.BlockHash == blockHash {
			for _, v := range vs.validators.ActiveValidators() {
				if v.Address == vote.Validator {
					votedStake += v.Stake
					break
				}
			}
		}
	}

	return float64(votedStake)/float64(totalStake) > VoteThreshold
}

// ─── Block ────────────────────────────────────────────────────────────────────

// BlockHeader is the GhostChain block header
type BlockHeader struct {
	Height       uint64
	ParentHash   [32]byte
	StateRoot    [32]byte
	TxRoot       [32]byte
	ReceiptRoot  [32]byte
	Timestamp    int64   // unix nanoseconds
	ChainID      uint64
	Proposer     [20]byte
	GasLimit     uint64
	GasUsed      uint64
	BaseFeeGST   uint64  // base fee in GST wei
}

// Hash returns the SHA-256 hash of the block header
func (h *BlockHeader) Hash() [32]byte {
	data := make([]byte, 0, 256)
	data = appendUint64(data, h.Height)
	data = append(data, h.ParentHash[:]...)
	data = append(data, h.StateRoot[:]...)
	data = append(data, h.TxRoot[:]...)
	data = appendUint64(data, uint64(h.Timestamp))
	data = appendUint64(data, h.ChainID)
	data = append(data, h.Proposer[:]...)
	return sha256.Sum256(data)
}

// HashHex returns the hex-encoded hash of the header
func (h *BlockHeader) HashHex() string {
	hash := h.Hash()
	return "0x" + hex.EncodeToString(hash[:])
}

// FinalizedBlock is a block with a finality certificate
type FinalizedBlock struct {
	Header      BlockHeader
	Precommits  []*Vote
	FinalizedAt time.Time
}

// ─── Consensus Engine ─────────────────────────────────────────────────────────

// Engine drives the CometBFT-compatible PoS consensus rounds
type Engine struct {
	chainID    uint64
	validators *ValidatorSet
	height     uint64
	round      uint32
}

// NewEngine creates a consensus engine for the given chain and validator set
func NewEngine(chainID uint64, validators *ValidatorSet) *Engine {
	return &Engine{chainID: chainID, validators: validators}
}

// ProposeBlock returns the validator that should propose the block at this height+round
// Uses deterministic round-robin weighted by stake
func (e *Engine) ProposeBlock(header *BlockHeader) [20]byte {
	active := e.validators.ActiveValidators()
	if len(active) == 0 {
		return [20]byte{}
	}

	idx := int(header.Height+uint64(e.round)) % len(active)
	return active[idx].Address
}

// Finalize checks if the vote set has quorum and returns a finalized block
func (e *Engine) Finalize(header *BlockHeader, precommits *VoteSet) (*FinalizedBlock, error) {
	blockHash := header.Hash()
	if !precommits.HasQuorum(blockHash) {
		return nil, errors.New("consensus: insufficient precommit votes for finality")
	}

	votes := make([]*Vote, 0)
	for _, v := range precommits.votes {
		if v.BlockHash == blockHash {
			votes = append(votes, v)
		}
	}

	return &FinalizedBlock{
		Header:      *header,
		Precommits:  votes,
		FinalizedAt: time.Now(),
	}, nil
}

// ─── Slashing ─────────────────────────────────────────────────────────────────

// SlashEvent records a slashing incident
type SlashEvent struct {
	Validator   [20]byte
	Reason      string
	SlashAmount uint64  // GST wei
	JailUntil   int64
	BlockHeight uint64
}

// SlashDoubleSign handles double-signing detection and slashing
func SlashDoubleSign(vs *ValidatorSet, addr [20]byte, height uint64) (*SlashEvent, error) {
	active := vs.ActiveValidators()
	var target *Validator
	for _, v := range active {
		if v.Address == addr {
			target = v
			break
		}
	}
	if target == nil {
		return nil, errors.New("consensus: validator not found for slashing")
	}

	// Slash 5% of stake for double-signing; jail for 7 days
	slashAmount := target.Stake / 20
	jailUntil   := time.Now().Add(7 * 24 * time.Hour).Unix()

	if err := vs.Jail(addr, jailUntil); err != nil {
		return nil, err
	}

	return &SlashEvent{
		Validator:   addr,
		Reason:      "double-sign",
		SlashAmount: slashAmount,
		JailUntil:   jailUntil,
		BlockHeight: height,
	}, nil
}

func appendUint64(b []byte, v uint64) []byte {
	return append(b, byte(v>>56), byte(v>>48), byte(v>>40), byte(v>>32),
		byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
}
