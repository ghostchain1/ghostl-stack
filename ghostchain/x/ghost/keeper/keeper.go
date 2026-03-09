// Package keeper implements the x/ghost module keeper.
//
// The keeper persists privacy-proof state (nullifier sets, key-image sets)
// in two stores:
//
//	nullifiers/<hex>  → spent   (byte "1")
//	keyimages/<hex>   → recorded (byte "1")
//
// It delegates coin movements to the standard bank module keeper and
// proof verification to the ZKVerifier interface (pluggable).
package keeper

import (
	"context"
	"encoding/hex"
	"fmt"

	"cosmossdk.io/log"
	"cosmossdk.io/store/prefix"
	storetypes "cosmossdk.io/store/types"
	"github.com/cosmos/cosmos-sdk/codec"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/ghostchain1/ghostchain/x/ghost/types"
)

// ZKVerifier is the interface required by ghost.Keeper to verify ZK-SNARK
// proofs on-chain without coupling the keeper to a concrete verifier library.
//
// In production, implement this interface with an on-chain Groth16 verifier
// (e.g. gnark or the Solidity ZkBatchVerifier ported to Go WASM).
// The stub implementation in verifier.go always returns true when the proof
// bytes are non-empty (structural validation only).
type ZKVerifier interface {
	// VerifyZK returns true when the ZK-SNARK proof is valid for the given
	// public inputs and nullifier.
	VerifyZK(ctx context.Context, proof []byte, publicInputs [][]byte, nullifier []byte) (bool, error)
}

// BankKeeper abstracts the subset of bank module calls needed by ghost.Keeper.
type BankKeeper interface {
	SendCoins(ctx context.Context, fromAddr sdk.AccAddress, toAddr sdk.AccAddress, amt sdk.Coins) error
}

// Keeper is the x/ghost module keeper.
type Keeper struct {
	cdc        codec.BinaryCodec
	storeKey   storetypes.StoreKey
	bank       BankKeeper
	zkVerifier ZKVerifier
	logger     log.Logger
}

// NewKeeper constructs a new ghost Keeper.
func NewKeeper(
	cdc codec.BinaryCodec,
	storeKey storetypes.StoreKey,
	bank BankKeeper,
	zkVerifier ZKVerifier,
	logger log.Logger,
) Keeper {
	return Keeper{
		cdc:        cdc,
		storeKey:   storeKey,
		bank:       bank,
		zkVerifier: zkVerifier,
		logger:     logger.With("module", fmt.Sprintf("x/%s", types.ModuleName)),
	}
}

// Logger returns the logger with the module name already set.
func (k Keeper) Logger(ctx context.Context) log.Logger {
	return k.logger
}

// ─── ZK proof helpers ────────────────────────────────────────────────────────

// nullifierKey returns the prefixed store key for a nullifier hash.
func nullifierKey(nullifier []byte) []byte {
	return append([]byte("nullifiers/"), []byte(hex.EncodeToString(nullifier))...)
}

// keyImageKey returns the prefixed store key for a ring-sig key image.
func keyImageKey(ki []byte) []byte {
	return append([]byte("keyimages/"), []byte(hex.EncodeToString(ki))...)
}

// IsNullifierSpent reports whether the nullifier has been recorded as spent.
func (k Keeper) IsNullifierSpent(ctx context.Context, nullifier []byte) bool {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	store := prefix.NewStore(sdkCtx.KVStore(k.storeKey), nil)
	return store.Has(nullifierKey(nullifier))
}

// MarkNullifierSpent records a nullifier as spent in the store.
func (k Keeper) MarkNullifierSpent(ctx context.Context, nullifier []byte) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	store := prefix.NewStore(sdkCtx.KVStore(k.storeKey), nil)
	store.Set(nullifierKey(nullifier), []byte{1})
}

// IsKeyImageUsed reports whether a ring-sig key image has been recorded.
func (k Keeper) IsKeyImageUsed(ctx context.Context, ki []byte) bool {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	store := prefix.NewStore(sdkCtx.KVStore(k.storeKey), nil)
	return store.Has(keyImageKey(ki))
}

// MarkKeyImageUsed records a key image in the store.
func (k Keeper) MarkKeyImageUsed(ctx context.Context, ki []byte) {
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	store := prefix.NewStore(sdkCtx.KVStore(k.storeKey), nil)
	store.Set(keyImageKey(ki), []byte{1})
}

// ─── Core operations ─────────────────────────────────────────────────────────

// VerifyAndRecord validates a PrivacyProof and records double-spend sentinels.
// It returns an error on:
//   - scheme-level validation failure
//   - detected double-spend (nullifier or key-image already present)
//   - ZK verification failure (zksnark proofs only)
func (k Keeper) VerifyAndRecord(ctx context.Context, proof *types.PrivacyProof) error {
	if err := proof.Validate(); err != nil {
		return types.ErrInvalidProof.Wrap(err.Error())
	}
	if len(proof.Proof) > types.DefaultMaxProofSize {
		return types.ErrProofTooLarge
	}

	switch proof.ProofType {
	case types.ProofTypeZKSnark:
		return k.verifyZKSnark(ctx, proof)
	case types.ProofTypeRingSig:
		return k.verifyRingSig(ctx, proof)
	case types.ProofTypeKnownNil:
		return nil
	default:
		return types.ErrUnknownProofType
	}
}

func (k Keeper) verifyZKSnark(ctx context.Context, proof *types.PrivacyProof) error {
	// Check nullifier has not been spent yet.
	if k.IsNullifierSpent(ctx, proof.NullifierHash) {
		return types.ErrNullifierSpent
	}

	// Run the on-chain ZK verifier (pluggable via ZKVerifier interface).
	if k.zkVerifier == nil {
		return types.ErrVerifierUnavail
	}
	ok, err := k.zkVerifier.VerifyZK(ctx, proof.Proof, proof.PublicInputs, proof.NullifierHash)
	if err != nil {
		return types.ErrZKVerificationFail.Wrap(err.Error())
	}
	if !ok {
		return types.ErrZKVerificationFail
	}

	// Record the nullifier as spent.
	k.MarkNullifierSpent(ctx, proof.NullifierHash)
	return nil
}

func (k Keeper) verifyRingSig(ctx context.Context, proof *types.PrivacyProof) error {
	// Check key image has not been used yet (double-spend guard).
	if k.IsKeyImageUsed(ctx, proof.KeyImage) {
		return types.ErrKeyImageUsed
	}

	// Structural verification: in production, replace with full LSAG / Triptych
	// library call.  The stub accepts any non-empty signature.
	if len(proof.Proof) == 0 {
		return types.ErrInvalidProof.Wrap("ring-sig proof bytes empty")
	}

	// Record the key image.
	k.MarkKeyImageUsed(ctx, proof.KeyImage)
	return nil
}

// PrivateTransfer verifies a PrivacyProof and then moves coins via the bank
// module.  The proof is verified before any state change; if verification
// fails the function returns early without touching balances.
func (k Keeper) PrivateTransfer(
	ctx context.Context,
	sender sdk.AccAddress,
	recipient sdk.AccAddress,
	amount sdk.Coins,
	proof *types.PrivacyProof,
) error {
	if err := k.VerifyAndRecord(ctx, proof); err != nil {
		return err
	}
	return k.bank.SendCoins(ctx, sender, recipient, amount)
}
