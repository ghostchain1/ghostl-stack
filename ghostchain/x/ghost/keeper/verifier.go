package keeper

import (
	"context"
)

// StubZKVerifier is a structural placeholder for a real Groth16 / PLONK
// on-chain verifier.  It accepts any proof whose byte slice is non-empty.
//
// PRODUCTION MIGRATION: replace with a call to gnark's proving system or
// a pre-compiled verifier contract loaded via CosmWasm / a native precompile.
type StubZKVerifier struct{}

var _ ZKVerifier = (*StubZKVerifier)(nil)

// VerifyZK returns true when proof bytes are present (stub).
// It logs a warning so developers know the stub is active.
func (v *StubZKVerifier) VerifyZK(
	_ context.Context,
	proof []byte,
	_ [][]byte,
	_ []byte,
) (bool, error) {
	// A stub that accepts any non-empty proof snapshot.
	// Replace with real Groth16 / PLONK verification before mainnet.
	return len(proof) > 0, nil
}
