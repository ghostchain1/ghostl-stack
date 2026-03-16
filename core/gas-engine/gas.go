// Package gasengine implements the GhostChain dynamic gas model.
// Computes base fees, priority fees, and AI-optimized gas estimates via GhostBrain.
package gasengine

import (
	"math/big"
)

// GSTUnit is 1 GST in wei (10^18)
var GSTUnit = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

// Base gas costs (GhostChain schedule)
const (
	BaseGas          = uint64(21_000) // simple GST transfer
	DataByteGas      = uint64(4)      // per byte of calldata
	NonZeroDataGas   = uint64(16)     // per non-zero calldata byte
	GhostBrainGas    = uint64(5_000)  // AI oracle invocation
	GhostBridgeGas   = uint64(15_000) // cross-layer bridge
	ContractCreateGas = uint64(32_000)
)

// GasParams holds current network gas parameters
type GasParams struct {
	BaseFee        *big.Int  // GST wei per gas unit
	PriorityFee    *big.Int  // GST wei tip to proposer
	MaxFeePerGas   *big.Int  // EIP-1559-compatible max
	GasLimit       uint64
	BlockGasTarget uint64
}

// DefaultGasParams returns sensible defaults for GhostChain devnet
func DefaultGasParams() GasParams {
	return GasParams{
		BaseFee:        new(big.Int).Mul(big.NewInt(7), new(big.Int).Exp(big.NewInt(10), big.NewInt(9), nil)), // 7 gwei
		PriorityFee:    new(big.Int).Mul(big.NewInt(2), new(big.Int).Exp(big.NewInt(10), big.NewInt(9), nil)), // 2 gwei
		MaxFeePerGas:   new(big.Int).Mul(big.NewInt(20), new(big.Int).Exp(big.NewInt(10), big.NewInt(9), nil)),
		GasLimit:       30_000_000,
		BlockGasTarget: 15_000_000,
	}
}

// Estimate computes the gas required for a transaction
func Estimate(calldata []byte, contractCreation bool) uint64 {
	gas := BaseGas

	if contractCreation {
		gas += ContractCreateGas
	}

	for _, b := range calldata {
		if b == 0 {
			gas += DataByteGas
		} else {
			gas += NonZeroDataGas
		}
	}

	return gas
}

// TotalCost computes the total GST cost of a transaction
//   totalCost = gasUsed * (baseFee + priorityFee)
func TotalCost(gasUsed uint64, params GasParams) *big.Int {
	effectiveFee := new(big.Int).Add(params.BaseFee, params.PriorityFee)
	return new(big.Int).Mul(new(big.Int).SetUint64(gasUsed), effectiveFee)
}

// AdjustBaseFee calculates the new base fee after a block using EIP-1559 logic.
// If the block used more gas than the target → fee increases; less → decreases.
func AdjustBaseFee(currentBaseFee *big.Int, gasUsed, gasTarget uint64) *big.Int {
	if gasUsed == gasTarget {
		return new(big.Int).Set(currentBaseFee)
	}

	// delta = currentBaseFee * abs(gasUsed - gasTarget) / gasTarget / 8
	diff := int64(gasUsed) - int64(gasTarget)
	absDiff := diff
	if absDiff < 0 {
		absDiff = -absDiff
	}

	delta := new(big.Int).Mul(currentBaseFee, big.NewInt(absDiff))
	delta.Div(delta, big.NewInt(int64(gasTarget)))
	delta.Div(delta, big.NewInt(8))

	// Ensure minimum delta of 1 wei
	if delta.Sign() == 0 {
		delta.SetInt64(1)
	}

	result := new(big.Int).Set(currentBaseFee)
	if diff > 0 {
		result.Add(result, delta)
	} else {
		// Don't go below 1 wei
		result.Sub(result, delta)
		if result.Sign() <= 0 {
			result.SetInt64(1)
		}
	}

	return result
}

// GhostBrainEstimate returns an AI-optimized gas estimate (stub for GhostBrain integration).
// In production this calls the GhostBrain Core REST API at :7900.
func GhostBrainEstimate(calldata []byte, historyBlocks []uint64) (uint64, float64) {
	baseEstimate := Estimate(calldata, false)

	// Confidence score based on calldata size heuristic
	confidence := 0.85
	if len(calldata) == 0 {
		confidence = 0.99
	} else if len(calldata) > 1024 {
		confidence = 0.70
	}

	// AI applies a 10% buffer over base estimate
	aiEstimate := baseEstimate + baseEstimate/10

	return aiEstimate, confidence
}

// FormatGST formats a wei amount as a human-readable GST string
func FormatGST(wei *big.Int) string {
	if wei == nil {
		return "0 GST"
	}
	whole := new(big.Int).Div(wei, GSTUnit)
	return whole.String() + " GST"
}
