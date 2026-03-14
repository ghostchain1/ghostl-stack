package types

// Event type and attribute constants for the x/ghost module.
const (
	ModuleName = "ghost"
	StoreKey   = "ghostpriv" // distinct from "ghostgov" to avoid store-key prefix collision
	RouterKey  = ModuleName

	// Event types
	EventTypePrivateTransfer  = "private_transfer"
	EventTypeProofVerified    = "proof_verified"
	EventTypeProofRejected    = "proof_rejected"
	EventTypeNullifierSpent   = "nullifier_spent"
	EventTypeKeyImageRecorded = "key_image_recorded"

	// Event attribute keys
	AttributeKeySender        = "sender"
	AttributeKeyRecipient     = "recipient"
	AttributeKeyAmount        = "amount"
	AttributeKeyProofType     = "proof_type"
	AttributeKeyNullifierHash = "nullifier_hash"
	AttributeKeyKeyImage      = "key_image"
	AttributeKeyAccepted      = "accepted"

	// Parameter keys
	ParamMaxProofSize   = "max_proof_size"
	ParamZKVerifierAddr = "zk_verifier_address"
)

// DefaultMaxProofSize is the maximum allowed serialised proof byte length (256 KB).
// This guards the chain against DoS via oversized proof blobs.
const DefaultMaxProofSize = 256 * 1024
