package types

import (
	errorsmod "cosmossdk.io/errors"
)

// x/ghost module sentinel errors.
var (
	ErrInvalidProof       = errorsmod.Register(ModuleName, 2, "invalid privacy proof")
	ErrNullifierSpent     = errorsmod.Register(ModuleName, 3, "nullifier already spent")
	ErrKeyImageUsed       = errorsmod.Register(ModuleName, 4, "key image already recorded (double-spend attempt)")
	ErrProofTooLarge      = errorsmod.Register(ModuleName, 5, "proof exceeds maximum allowed size")
	ErrUnknownProofType   = errorsmod.Register(ModuleName, 6, "unknown proof type")
	ErrVerifierUnavail    = errorsmod.Register(ModuleName, 7, "on-chain ZK verifier is not configured")
	ErrZKVerificationFail = errorsmod.Register(ModuleName, 8, "zero-knowledge proof verification failed")
)
