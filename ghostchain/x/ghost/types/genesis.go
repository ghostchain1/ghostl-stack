package types

import (
	codec "github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
)

// GenesisState is the genesis state of the x/ghost module.
// Currently empty; nullifier / key-image sets start empty at genesis.
type GenesisState struct{}

// DefaultGenesisState returns the default genesis state.
func DefaultGenesisState() *GenesisState { return &GenesisState{} }

// Validate validates the genesis state.
func (gs *GenesisState) Validate() error { return nil }

// Make GenesisState implement proto.Message (minimal stub).
func (*GenesisState) ProtoMessage()            {}
func (*GenesisState) Reset()                   {}
func (*GenesisState) String() string           { return "{}" }
func (*GenesisState) ProtoSize() int           { return 0 }
func (*GenesisState) Marshal() ([]byte, error) { return []byte{}, nil }
func (*GenesisState) Unmarshal(_ []byte) error { return nil }

// RegisterCodec registers the genesis state with the codec.
func RegisterCodec(cdc *codec.LegacyAmino) {}

// RegisterInterfaces registers message types.
func RegisterInterfaces(_ codectypes.InterfaceRegistry) {}

// RegisterMsgServer is a no-op placeholder; the concrete server is registered
// in module.go via RegisterServices.  This stub avoids an import cycle.
func RegisterMsgServer(_ interface{}, _ MsgServer) {}
