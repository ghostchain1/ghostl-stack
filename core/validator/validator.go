// Package validator implements GhostChain block production and validation.
// Each active validator in the set participates in CometBFT-compatible rounds.
package validator

import (
	"crypto/sha256"
	"errors"
	"math/big"
	"sync"
	"time"
)

// ChainIDs supported by this validator
const (
	ChainIDL1 = 14000101
	ChainIDL2 = 901
	ChainIDL3 = 903
)

// MinStake is the minimum GST required to register as a validator (100k GST)
var MinStake = new(big.Int).Mul(big.NewInt(100_000), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))

// ValidatorState tracks the runtime state of a single validator node
type ValidatorState struct {
	Address        [20]byte
	PublicKey      [64]byte
	Stake          *big.Int    // GST wei
	Commission     uint8       // basis points
	BlocksProposed uint64
	BlocksSigned   uint64
	Uptime         float64     // 0.0—1.0
	LastActivity   time.Time
	Active         bool
}

// ProposedBlock is a block candidate produced by a validator
type ProposedBlock struct {
	Height     uint64
	ParentHash [32]byte
	Proposer   [20]byte
	Timestamp  int64
	Txs        [][]byte   // encoded transactions
	GasLimit   uint64
	GasUsed    uint64
	StateRoot  [32]byte
	TxRoot     [32]byte
	Hash       [32]byte
}

// NewProposedBlock constructs a block candidate
func NewProposedBlock(height uint64, parentHash [32]byte, proposer [20]byte, txs [][]byte, chainID uint64) *ProposedBlock {
	b := &ProposedBlock{
		Height:     height,
		ParentHash: parentHash,
		Proposer:   proposer,
		Timestamp:  time.Now().UnixNano(),
		Txs:        txs,
	}
	b.TxRoot = computeTxRoot(txs)
	b.Hash   = b.computeHash()
	return b
}

func (b *ProposedBlock) computeHash() [32]byte {
	h := sha256.New()
	writeUint64(h, b.Height)
	h.Write(b.ParentHash[:])
	h.Write(b.Proposer[:])
	writeUint64(h, uint64(b.Timestamp))
	h.Write(b.TxRoot[:])
	var result [32]byte
	copy(result[:], h.Sum(nil))
	return result
}

func computeTxRoot(txs [][]byte) [32]byte {
	h := sha256.New()
	for _, tx := range txs {
		txHash := sha256.Sum256(tx)
		h.Write(txHash[:])
	}
	var root [32]byte
	copy(root[:], h.Sum(nil))
	return root
}

// ─── Validator Node ───────────────────────────────────────────────────────────

// Node is a running GhostChain validator node
type Node struct {
	mu      sync.RWMutex
	state   *ValidatorState
	chainID uint64
}

// NewNode creates a new validator node
func NewNode(address [20]byte, publicKey [64]byte, stake *big.Int, chainID uint64) (*Node, error) {
	if stake.Cmp(MinStake) < 0 {
		return nil, errors.New("validator: stake below minimum (100k GST required)")
	}
	if chainID != ChainIDL1 && chainID != ChainIDL2 && chainID != ChainIDL3 {
		return nil, errors.New("validator: invalid GhostChain chainID")
	}

	return &Node{
		chainID: chainID,
		state: &ValidatorState{
			Address:      address,
			PublicKey:    publicKey,
			Stake:        new(big.Int).Set(stake),
			Active:       true,
			LastActivity: time.Now(),
		},
	}, nil
}

// ProposeBlock creates a block proposal at the given height
func (n *Node) ProposeBlock(height uint64, parentHash [32]byte, txs [][]byte) (*ProposedBlock, error) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if !n.state.Active {
		return nil, errors.New("validator: node is not active")
	}

	block := NewProposedBlock(height, parentHash, n.state.Address, txs, n.chainID)
	n.state.BlocksProposed++
	n.state.LastActivity = time.Now()
	return block, nil
}

// SignBlock records that this validator has signed a block
func (n *Node) SignBlock(blockHash [32]byte) ([]byte, error) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if !n.state.Active {
		return nil, errors.New("validator: node is not active")
	}

	// Simplified: in production, sign with secp256k1 private key
	sig := sha256.Sum256(append(n.state.PublicKey[:32], blockHash[:]...))
	n.state.BlocksSigned++
	n.state.LastActivity = time.Now()
	return sig[:], nil
}

// UpdateUptime records whether this validator was online for the last round
func (n *Node) UpdateUptime(wasOnline bool, windowSize uint64) {
	n.mu.Lock()
	defer n.mu.Unlock()

	current := n.state.Uptime
	if wasOnline {
		n.state.Uptime = (current*float64(windowSize-1) + 1.0) / float64(windowSize)
	} else {
		n.state.Uptime = (current * float64(windowSize-1)) / float64(windowSize)
	}
}

// State returns a copy of the current validator state
func (n *Node) State() ValidatorState {
	n.mu.RLock()
	defer n.mu.RUnlock()
	s := *n.state
	s.Stake = new(big.Int).Set(n.state.Stake)
	return s
}

// Deactivate marks this node as inactive (jailed, undelegated, etc.)
func (n *Node) Deactivate() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.state.Active = false
}

// ─── Registration ─────────────────────────────────────────────────────────────

// Registry tracks all registered validators for a chain
type Registry struct {
	mu       sync.RWMutex
	nodes    map[[20]byte]*Node
	chainID  uint64
}

// NewRegistry creates a validator registry for a chain
func NewRegistry(chainID uint64) *Registry {
	return &Registry{
		nodes:   make(map[[20]byte]*Node),
		chainID: chainID,
	}
}

// Register adds a validator node to the registry
func (r *Registry) Register(address [20]byte, publicKey [64]byte, stake *big.Int) error {
	node, err := NewNode(address, publicKey, stake, r.chainID)
	if err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.nodes[address]; exists {
		return errors.New("validator: already registered")
	}
	r.nodes[address] = node
	return nil
}

// Get retrieves a validator node
func (r *Registry) Get(address [20]byte) (*Node, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	n, ok := r.nodes[address]
	return n, ok
}

// ActiveCount returns the number of active validators
func (r *Registry) ActiveCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	for _, n := range r.nodes {
		if n.state.Active {
			count++
		}
	}
	return count
}

func writeUint64(h interface{ Write([]byte) (int, error) }, v uint64) {
	b := [8]byte{
		byte(v >> 56), byte(v >> 48), byte(v >> 40), byte(v >> 32),
		byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v),
	}
	h.Write(b[:])
}
