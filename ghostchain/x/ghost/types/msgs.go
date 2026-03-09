package types

import (
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
	sdkerrors "github.com/cosmos/cosmos-sdk/types/errors"
)

var (
	_ sdk.Msg = &MsgPrivateTransfer{}
	_ sdk.Msg = &MsgSubmitProof{}
)

// MsgPrivateTransfer sends tokens from one address to another with an
// attached privacy proof.  The proof is verified on-chain before the coins
// are moved via the bank module.
type MsgPrivateTransfer struct {
	// Sender is the bech32 address initiating the transfer.
	Sender string `json:"sender"`

	// Recipient is the bech32 destination address.
	Recipient string `json:"recipient"`

	// Amount are the coins to transfer.
	Amount sdk.Coins `json:"amount"`

	// Proof is the attached privacy proof (ZK-SNARK or ring-signature).
	Proof PrivacyProof `json:"proof"`

	// Memo is an optional encrypted memo field.
	Memo string `json:"memo,omitempty"`
}

func (msg *MsgPrivateTransfer) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(msg.Sender); err != nil {
		return sdkerrors.ErrInvalidAddress.Wrapf("invalid sender address: %s", err)
	}
	if _, err := sdk.AccAddressFromBech32(msg.Recipient); err != nil {
		return sdkerrors.ErrInvalidAddress.Wrapf("invalid recipient address: %s", err)
	}
	if msg.Amount.Empty() {
		return sdkerrors.ErrInvalidCoins.Wrap("transfer amount must not be empty")
	}
	if !msg.Amount.IsValid() {
		return sdkerrors.ErrInvalidCoins.Wrap("transfer amount is invalid")
	}
	if err := msg.Proof.Validate(); err != nil {
		return ErrInvalidProof.Wrap(err.Error())
	}
	return nil
}

func (msg *MsgPrivateTransfer) ProtoMessage()  {}
func (msg *MsgPrivateTransfer) Reset()         { *msg = MsgPrivateTransfer{} }
func (msg *MsgPrivateTransfer) String() string { return fmt.Sprintf("%+v", *msg) }

func (msg *MsgPrivateTransfer) GetSigners() []sdk.AccAddress {
	signer, _ := sdk.AccAddressFromBech32(msg.Sender)
	return []sdk.AccAddress{signer}
}

// MsgSubmitProof submits a stand-alone privacy proof for on-chain verification
// without a transfer (e.g. for proving membership in a ring).
type MsgSubmitProof struct {
	Submitter string       `json:"submitter"`
	Proof     PrivacyProof `json:"proof"`
}

func (msg *MsgSubmitProof) ValidateBasic() error {
	if _, err := sdk.AccAddressFromBech32(msg.Submitter); err != nil {
		return sdkerrors.ErrInvalidAddress.Wrapf("invalid submitter address: %s", err)
	}
	return msg.Proof.Validate()
}

func (msg *MsgSubmitProof) ProtoMessage()  {}
func (msg *MsgSubmitProof) Reset()         { *msg = MsgSubmitProof{} }
func (msg *MsgSubmitProof) String() string { return fmt.Sprintf("%+v", *msg) }

func (msg *MsgSubmitProof) GetSigners() []sdk.AccAddress {
	signer, _ := sdk.AccAddressFromBech32(msg.Submitter)
	return []sdk.AccAddress{signer}
}
