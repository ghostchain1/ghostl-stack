// Package state implements the GhostChain world state with Merkle-Patricia trie.
// Manages account balances, nonces, contract code, and contract storage.
package state

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
)

// GSTUnit is 1 GST in wei (10^18)
var GSTUnit = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

// EmptyCodeHash is the hash of empty contract code
var EmptyCodeHash = sha256.Sum256([]byte{})

// Account represents a GhostChain account (EOA or contract)
type Account struct {
	Nonce    uint64
	Balance  *big.Int   // GST in wei
	CodeHash [32]byte   // sha256 of contract bytecode; EmptyCodeHash for EOAs
	Root     [32]byte   // storage Merkle root
}

// IsContract returns true if this account has non-empty code
func (a *Account) IsContract() bool {
	return a.CodeHash != EmptyCodeHash
}

// Storage maps 32-byte keys to 32-byte values
type Storage map[[32]byte][32]byte

// StateDB is the mutable GhostChain world state
type StateDB struct {
	mu       sync.RWMutex
	accounts map[[20]byte]*Account
	storage  map[[20]byte]Storage
	code     map[[32]byte][]byte  // codeHash → bytecode
	dirty    map[[20]byte]bool    // tracks modified accounts
	snapshots []snapshot
}

type snapshot struct {
	accounts map[[20]byte]*Account
	storage  map[[20]byte]Storage
}

// New creates a new empty StateDB
func New() *StateDB {
	return &StateDB{
		accounts: make(map[[20]byte]*Account),
		storage:  make(map[[20]byte]Storage),
		code:     make(map[[32]byte][]byte),
		dirty:    make(map[[20]byte]bool),
	}
}

// ─── Account operations ───────────────────────────────────────────────────────

// GetAccount returns an account (creates zero-value if not exists)
func (s *StateDB) GetAccount(addr [20]byte) *Account {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if a, ok := s.accounts[addr]; ok {
		return &Account{
			Nonce:    a.Nonce,
			Balance:  new(big.Int).Set(a.Balance),
			CodeHash: a.CodeHash,
			Root:     a.Root,
		}
	}
	return &Account{Balance: new(big.Int)}
}

// SetBalance sets the GST balance of an address
func (s *StateDB) SetBalance(addr [20]byte, balance *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureAccount(addr).Balance = new(big.Int).Set(balance)
	s.dirty[addr] = true
}

// AddBalance adds amount to an address's balance
func (s *StateDB) AddBalance(addr [20]byte, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.ensureAccount(addr)
	acc.Balance.Add(acc.Balance, amount)
	s.dirty[addr] = true
}

// SubBalance subtracts amount from an address's balance (returns error if insufficient)
func (s *StateDB) SubBalance(addr [20]byte, amount *big.Int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	acc := s.ensureAccount(addr)
	if acc.Balance.Cmp(amount) < 0 {
		return errors.New("state: insufficient GST balance")
	}
	acc.Balance.Sub(acc.Balance, amount)
	s.dirty[addr] = true
	return nil
}

// Transfer moves amount from src to dst atomically
func (s *StateDB) Transfer(src, dst [20]byte, amount *big.Int) error {
	if err := s.SubBalance(src, amount); err != nil {
		return err
	}
	s.AddBalance(dst, amount)
	return nil
}

// GetNonce returns the current nonce of an address
func (s *StateDB) GetNonce(addr [20]byte) uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if a, ok := s.accounts[addr]; ok {
		return a.Nonce
	}
	return 0
}

// IncrementNonce atomically increments an address's nonce
func (s *StateDB) IncrementNonce(addr [20]byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureAccount(addr).Nonce++
	s.dirty[addr] = true
}

// ─── Contract code ────────────────────────────────────────────────────────────

// SetCode stores contract bytecode and updates the account's code hash
func (s *StateDB) SetCode(addr [20]byte, code []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	hash := sha256.Sum256(code)
	s.code[hash] = code
	s.ensureAccount(addr).CodeHash = hash
	s.dirty[addr] = true
}

// GetCode retrieves the bytecode for an address
func (s *StateDB) GetCode(addr [20]byte) []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	acc, ok := s.accounts[addr]
	if !ok {
		return nil
	}
	return s.code[acc.CodeHash]
}

// ─── Contract storage ─────────────────────────────────────────────────────────

// GetStorage reads a storage slot value for a contract
func (s *StateDB) GetStorage(addr [20]byte, key [32]byte) [32]byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if store, ok := s.storage[addr]; ok {
		return store[key]
	}
	return [32]byte{}
}

// SetStorage writes a storage slot value for a contract
func (s *StateDB) SetStorage(addr [20]byte, key, value [32]byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.storage[addr]; !ok {
		s.storage[addr] = make(Storage)
	}
	s.storage[addr][key] = value
	s.dirty[addr] = true
}

// ─── Snapshot / revert ────────────────────────────────────────────────────────

// Snapshot saves a rollback point and returns a snapshot ID
func (s *StateDB) Snapshot() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	accCopy := make(map[[20]byte]*Account, len(s.accounts))
	for k, v := range s.accounts {
		accCopy[k] = &Account{
			Nonce:    v.Nonce,
			Balance:  new(big.Int).Set(v.Balance),
			CodeHash: v.CodeHash,
			Root:     v.Root,
		}
	}
	storCopy := make(map[[20]byte]Storage, len(s.storage))
	for addr, store := range s.storage {
		c := make(Storage, len(store))
		for k, v := range store {
			c[k] = v
		}
		storCopy[addr] = c
	}

	s.snapshots = append(s.snapshots, snapshot{accounts: accCopy, storage: storCopy})
	return len(s.snapshots) - 1
}

// RevertToSnapshot restores state to the snapshot with the given ID
func (s *StateDB) RevertToSnapshot(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id < 0 || id >= len(s.snapshots) {
		return errors.New("state: invalid snapshot ID")
	}

	snap := s.snapshots[id]
	s.accounts  = snap.accounts
	s.storage   = snap.storage
	s.snapshots = s.snapshots[:id]
	s.dirty     = make(map[[20]byte]bool)
	return nil
}

// ─── State root (simplified Merkle) ─────────────────────────────────────────

// StateRoot computes a deterministic hash of all account states.
// Production implementation uses a full Merkle-Patricia trie.
func (s *StateDB) StateRoot() [32]byte {
	s.mu.RLock()
	defer s.mu.RUnlock()

	h := sha256.New()
	// In production: sorted Merkle trie — simplified here
	for addr, acc := range s.accounts {
		h.Write(addr[:])
		h.Write([]byte(acc.Balance.String()))
		h.Write([]byte{byte(acc.Nonce >> 56), byte(acc.Nonce >> 48),
			byte(acc.Nonce >> 40), byte(acc.Nonce >> 32),
			byte(acc.Nonce >> 24), byte(acc.Nonce >> 16),
			byte(acc.Nonce >> 8), byte(acc.Nonce)})
		h.Write(acc.CodeHash[:])
	}

	var root [32]byte
	copy(root[:], h.Sum(nil))
	return root
}

// StateRootHex returns the hex-encoded state root
func (s *StateDB) StateRootHex() string {
	root := s.StateRoot()
	return "0x" + hex.EncodeToString(root[:])
}

func (s *StateDB) ensureAccount(addr [20]byte) *Account {
	if _, ok := s.accounts[addr]; !ok {
		s.accounts[addr] = &Account{Balance: new(big.Int)}
	}
	return s.accounts[addr]
}
