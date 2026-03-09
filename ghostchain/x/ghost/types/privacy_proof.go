package types

import (
	"encoding/hex"
	"errors"
)

// PrivacyProof represents a zero-knowledge proof or ring signature submitted
// to GhostChain's x/ghost privacy module.
//
// For ZK-SNARK / Groth16 proofs the fields map to:
//   ProofType = "zksnark"
//   Proof     = serialised Groth16 proof bytes (π_A || π_B || π_C)
//   PublicInputs = serialised public-witness values
//   NullifierHash = SHA-256 of the spent note to prevent double-spending
//
// For ring-signature schemes (e.g. LSAG / Monero-style):
//   ProofType = "ringsig"
//   Proof     = serialised ring-signature bytes
//   KeyImage  = key-image scalar that prevents double-spending
//   RingCommitment = Pedersen commitment to the ring's key-set
const (
	ProofTypeZKSnark  = "zksnark"
	ProofTypeRingSig  = "ringsig"
	ProofTypeKnownNil = "none" // plaintext / non-private
)

// PrivacyProof is the canonical privacy proof type stored on-chain.
type PrivacyProof struct {
	// ProofType describes the proof scheme ("zksnark" | "ringsig" | "none").
	ProofType string `json:"proof_type"`

	// Proof is the raw proof blob (schema depends on ProofType).
	Proof []byte `json:"proof"`

	// PublicInputs are the public witness values exposed to the verifier
	// (ZK proofs only; nil for ring-sig proofs).
	PublicInputs [][]byte `json:"public_inputs,omitempty"`

	// NullifierHash is the spent-note commitment for ZK proofs.
	// Prevents double-spending across private transfers.
	NullifierHash []byte `json:"nullifier_hash,omitempty"`

	// KeyImage is the key-image scalar for LSAG ring-signature proofs.
	KeyImage []byte `json:"key_image,omitempty"`

	// RingCommitment is a Pedersen commitment binding the ring public-keys.
	RingCommitment []byte `json:"ring_commitment,omitempty"`
}

// Validate performs basic well-formedness checks.
func (p *PrivacyProof) Validate() error {
	switch p.ProofType {
	case ProofTypeZKSnark:
		if len(p.Proof) == 0 {
			return errors.New("ghost/types: zksnark proof bytes must not be empty")
		}
		if len(p.NullifierHash) == 0 {
			return errors.New("ghost/types: zksnark proof requires a nullifier hash")
		}
	case ProofTypeRingSig:
		if len(p.Proof) == 0 {
			return errors.New("ghost/types: ring-signature proof bytes must not be empty")
		}
		if len(p.KeyImage) == 0 {
			return errors.New("ghost/types: ring-signature proof requires a key image")
		}
	case ProofTypeKnownNil:
		// plain-text operations are allowed; no proof required.
	default:
		return errors.New("ghost/types: unknown proof type: " + p.ProofType)
	}
	return nil
}

// NullifierHex returns the nullifier hash as a lower-case hex string.
func (p *PrivacyProof) NullifierHex() string {
	return hex.EncodeToString(p.NullifierHash)
}

// KeyImageHex returns the key image as a lower-case hex string.
func (p *PrivacyProof) KeyImageHex() string {
	return hex.EncodeToString(p.KeyImage)
}
