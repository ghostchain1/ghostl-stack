// Package mempool implements the GhostChain transaction mempool.
// Maintains a priority-ordered pending transaction pool with
// anti-spam protection and GhostBrain AI-driven ordering.
package mempool

import (
	"container/heap"
	"errors"
	"math/big"
	"sync"
	"time"
)

// MaxMempoolSize is the hard cap on pending transactions
const MaxMempoolSize = 10_000

// MaxTxSize is the maximum allowed calldata size in bytes
const MaxTxSize = 128 * 1024 // 128 KB

// Transaction represents a pending GhostChain transaction
type Transaction struct {
	Hash        [32]byte
	From        [20]byte
	To          *[20]byte   // nil = contract creation
	Value       *big.Int    // GST wei
	Data        []byte
	Nonce       uint64
	GasLimit    uint64
	MaxFee      *big.Int    // max fee per gas (GST wei)
	PriorityFee *big.Int    // tip to proposer
	ChainID     uint64
	Signature   []byte
	ReceivedAt  time.Time
}

// EffectiveTip returns the priority fee capped at maxFee
func (tx *Transaction) EffectiveTip(baseFee *big.Int) *big.Int {
	tip := new(big.Int).Sub(tx.MaxFee, baseFee)
	if tip.Cmp(tx.PriorityFee) > 0 {
		return new(big.Int).Set(tx.PriorityFee)
	}
	return tip
}

// ─── Priority queue ───────────────────────────────────────────────────────────

type txHeap struct {
	txs     []*Transaction
	baseFee *big.Int
}

func (h txHeap) Len() int { return len(h.txs) }

func (h txHeap) Less(i, j int) bool {
	// Higher effective tip wins
	ti := h.txs[i].EffectiveTip(h.baseFee)
	tj := h.txs[j].EffectiveTip(h.baseFee)
	return ti.Cmp(tj) > 0
}

func (h txHeap) Swap(i, j int) { h.txs[i], h.txs[j] = h.txs[j], h.txs[i] }

func (h *txHeap) Push(x interface{}) {
	h.txs = append(h.txs, x.(*Transaction))
}

func (h *txHeap) Pop() interface{} {
	old := h.txs
	n   := len(old)
	tx  := old[n-1]
	h.txs = old[:n-1]
	return tx
}

// ─── Mempool ─────────────────────────────────────────────────────────────────

// Mempool is the GhostChain pending transaction pool
type Mempool struct {
	mu      sync.RWMutex
	pending *txHeap
	index   map[[32]byte]*Transaction
	nonces  map[[20]byte]uint64
	baseFee *big.Int
}

// New creates a new Mempool with the given base fee
func New(baseFee *big.Int) *Mempool {
	h := &txHeap{baseFee: baseFee}
	heap.Init(h)
	return &Mempool{
		pending: h,
		index:   make(map[[32]byte]*Transaction),
		nonces:  make(map[[20]byte]uint64),
		baseFee: new(big.Int).Set(baseFee),
	}
}

// Add inserts a transaction into the mempool
func (m *Mempool) Add(tx *Transaction) error {
	if err := m.validate(tx); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.index[tx.Hash]; exists {
		return errors.New("mempool: duplicate transaction")
	}
	if m.pending.Len() >= MaxMempoolSize {
		return errors.New("mempool: full — capacity exceeded")
	}

	tx.ReceivedAt = time.Now()
	heap.Push(m.pending, tx)
	m.index[tx.Hash] = tx

	return nil
}

// Get retrieves a transaction by hash
func (m *Mempool) Get(hash [32]byte) (*Transaction, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	tx, ok := m.index[hash]
	return tx, ok
}

// Remove removes a transaction from the mempool (post-inclusion in block)
func (m *Mempool) Remove(hash [32]byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.index, hash)
	// Rebuild heap without the removed tx
	remaining := make([]*Transaction, 0, m.pending.Len())
	for _, tx := range m.pending.txs {
		if tx.Hash != hash {
			remaining = append(remaining, tx)
		}
	}
	m.pending.txs = remaining
	heap.Init(m.pending)
}

// SelectForBlock returns up to `limit` transactions for block inclusion.
// Orders by effective tip descending (highest tip first).
func (m *Mempool) SelectForBlock(limit int) []*Transaction {
	m.mu.Lock()
	defer m.mu.Unlock()

	h := &txHeap{txs: make([]*Transaction, len(m.pending.txs)), baseFee: m.baseFee}
	copy(h.txs, m.pending.txs)
	heap.Init(h)

	selected := make([]*Transaction, 0, limit)
	for h.Len() > 0 && len(selected) < limit {
		tx := heap.Pop(h).(*Transaction)
		selected = append(selected, tx)
	}
	return selected
}

// Size returns the current number of pending transactions
func (m *Mempool) Size() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.pending.Len()
}

// UpdateBaseFee updates the base fee and reorders the heap
func (m *Mempool) UpdateBaseFee(baseFee *big.Int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.baseFee = new(big.Int).Set(baseFee)
	m.pending.baseFee = m.baseFee
	heap.Init(m.pending)
}

// Purge removes all transactions older than maxAge
func (m *Mempool) Purge(maxAge time.Duration) int {
	m.mu.Lock()
	defer m.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	fresh := make([]*Transaction, 0, m.pending.Len())
	purged := 0

	for _, tx := range m.pending.txs {
		if tx.ReceivedAt.After(cutoff) {
			fresh = append(fresh, tx)
		} else {
			delete(m.index, tx.Hash)
			purged++
		}
	}

	m.pending.txs = fresh
	heap.Init(m.pending)
	return purged
}

func (m *Mempool) validate(tx *Transaction) error {
	if len(tx.Data) > MaxTxSize {
		return errors.New("mempool: tx calldata exceeds MaxTxSize")
	}
	if tx.GasLimit == 0 {
		return errors.New("mempool: gas limit must be > 0")
	}
	if tx.MaxFee == nil || tx.MaxFee.Sign() < 0 {
		return errors.New("mempool: invalid max fee")
	}
	if tx.MaxFee.Cmp(m.baseFee) < 0 {
		return errors.New("mempool: max fee below current base fee")
	}
	if tx.ChainID != 14000101 && tx.ChainID != 901 && tx.ChainID != 903 {
		return errors.New("mempool: invalid GhostChain chain ID")
	}
	return nil
}
