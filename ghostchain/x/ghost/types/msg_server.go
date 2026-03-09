package types

import "context"

// MsgServer is the server API for the ghost module MsgService.
type MsgServer interface {
	// PrivateTransfer sends coins between accounts with a privacy proof.
	PrivateTransfer(ctx context.Context, msg *MsgPrivateTransfer) (*MsgPrivateTransferResponse, error)

	// SubmitProof submits a standalone privacy proof for on-chain recording.
	SubmitProof(ctx context.Context, msg *MsgSubmitProof) (*MsgSubmitProofResponse, error)
}

// MsgPrivateTransferResponse is the response type for MsgPrivateTransfer.
type MsgPrivateTransferResponse struct{}

// MsgSubmitProofResponse is the response type for MsgSubmitProof.
type MsgSubmitProofResponse struct{}
