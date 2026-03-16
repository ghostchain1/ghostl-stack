// Package token implements the GST (GhostChain native token) runtime.
// Handles mint, burn, transfer, and treasury routing logic at the protocol level.
// This runs inside the GhostChain L1 state machine.
package token

import (
	"errors"
	"math/big"
	"sync"
)

// GSTUnit is 1 GST in wei (10^18)
var GSTUnit = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

// MaxSupply is the maximum GST circulating supply (1 billion GST)
var MaxSupply = new(big.Int).Mul(big.NewInt(1_000_000_000), GSTUnit)

// TreasuryAddress is the canonical L1 treasury address
// Set by governance — placeholder here
var TreasuryAddress = [20]byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}

// FeeDistribution defines how transaction fees are split
type FeeDistribution struct {
	ValidatorShare  int // basis points (e.g. 7000 = 70%)
	TreasuryShare   int // basis points (e.g. 2000 = 20%)
	BurnShare       int // basis points (e.g. 1000 = 10%)
}

// DefaultFeeDistribution is the canonical GhostChain fee split
var DefaultFeeDistribution = FeeDistribution{
	ValidatorShare: 7000,
	TreasuryShare:  2000,
	BurnShare:      1000,
}

// GSTRuntime manages the GST token ledger at the protocol layer
type GSTRuntime struct {
	mu            sync.RWMutex
	balances      map[[20]byte]*big.Int
	totalSupply   *big.Int
	distribution  FeeDistribution
	mintAuthority [20]byte // only this address can mint (governance contract)
}

// New creates a GSTRuntime with genesis allocations
func New(mintAuthority [20]byte, distribution FeeDistribution) *GSTRuntime {
	return &GSTRuntime{
		balances:     make(map[[20]byte]*big.Int),
		totalSupply:  new(big.Int),
		distribution: distribution,
		mintAuthority: mintAuthority,
	}
}

// AllocGenesis sets genesis balances (called once at chain start)
func (r *GSTRuntime) AllocGenesis(allocations map[[20]byte]*big.Int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	total := new(big.Int)
	for _, amount := range allocations {
		total.Add(total, amount)
	}
	if total.Cmp(MaxSupply) > 0 {
		return errors.New("gst: genesis allocations exceed MaxSupply")
	}

	for addr, amount := range allocations {
		r.balances[addr] = new(big.Int).Set(amount)
	}
	r.totalSupply = total
	return nil
}

// BalanceOf returns the GST balance of an address
func (r *GSTRuntime) BalanceOf(addr [20]byte) *big.Int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if b, ok := r.balances[addr]; ok {
		return new(big.Int).Set(b)
	}
	return new(big.Int)
}

// TotalSupply returns the current circulating supply
func (r *GSTRuntime) TotalSupply() *big.Int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return new(big.Int).Set(r.totalSupply)
}

// Transfer moves amount GST from src to dst
func (r *GSTRuntime) Transfer(src, dst [20]byte, amount *big.Int) error {
	if amount.Sign() <= 0 {
		return errors.New("gst: transfer amount must be positive")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	srcBal := r.getBalance(src)
	if srcBal.Cmp(amount) < 0 {
		return errors.New("gst: insufficient balance")
	}

	r.setBalance(src, new(big.Int).Sub(srcBal, amount))
	r.setBalance(dst, new(big.Int).Add(r.getBalance(dst), amount))
	return nil
}

// Mint creates new GST and credits it to the recipient.
// Only the mintAuthority (governance contract) may call this.
func (r *GSTRuntime) Mint(caller, recipient [20]byte, amount *big.Int) error {
	if caller != r.mintAuthority {
		return errors.New("gst: caller is not mint authority")
	}
	if amount.Sign() <= 0 {
		return errors.New("gst: mint amount must be positive")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	newSupply := new(big.Int).Add(r.totalSupply, amount)
	if newSupply.Cmp(MaxSupply) > 0 {
		return errors.New("gst: mint would exceed MaxSupply")
	}

	r.setBalance(recipient, new(big.Int).Add(r.getBalance(recipient), amount))
	r.totalSupply = newSupply
	return nil
}

// Burn destroys GST from an address, reducing total supply
func (r *GSTRuntime) Burn(addr [20]byte, amount *big.Int) error {
	if amount.Sign() <= 0 {
		return errors.New("gst: burn amount must be positive")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	bal := r.getBalance(addr)
	if bal.Cmp(amount) < 0 {
		return errors.New("gst: insufficient balance for burn")
	}

	r.setBalance(addr, new(big.Int).Sub(bal, amount))
	r.totalSupply.Sub(r.totalSupply, amount)
	return nil
}

// DistributeFees splits transaction fees among validator, treasury, and burn
func (r *GSTRuntime) DistributeFees(totalFee *big.Int, validator [20]byte) error {
	if totalFee.Sign() <= 0 {
		return nil
	}

	basisTotal := int64(r.distribution.ValidatorShare + r.distribution.TreasuryShare + r.distribution.BurnShare)
	if basisTotal != 10000 {
		return errors.New("gst: fee distribution must sum to 10000 basis points")
	}

	validatorFee := new(big.Int).Mul(totalFee, big.NewInt(int64(r.distribution.ValidatorShare)))
	validatorFee.Div(validatorFee, big.NewInt(10000))

	treasuryFee := new(big.Int).Mul(totalFee, big.NewInt(int64(r.distribution.TreasuryShare)))
	treasuryFee.Div(treasuryFee, big.NewInt(10000))

	burnFee := new(big.Int).Sub(totalFee, new(big.Int).Add(validatorFee, treasuryFee))

	r.mu.Lock()
	defer r.mu.Unlock()

	r.setBalance(validator, new(big.Int).Add(r.getBalance(validator), validatorFee))
	r.setBalance(TreasuryAddress, new(big.Int).Add(r.getBalance(TreasuryAddress), treasuryFee))
	// Burn: reduce total supply
	r.totalSupply.Sub(r.totalSupply, burnFee)

	return nil
}

func (r *GSTRuntime) getBalance(addr [20]byte) *big.Int {
	if b, ok := r.balances[addr]; ok {
		return b
	}
	return new(big.Int)
}

func (r *GSTRuntime) setBalance(addr [20]byte, balance *big.Int) {
	if balance.Sign() == 0 {
		delete(r.balances, addr)
		return
	}
	r.balances[addr] = balance
}
