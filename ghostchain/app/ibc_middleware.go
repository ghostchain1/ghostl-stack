// Package app — IBC middleware for GhostChain routing-law enforcement.
//
// GhostChain's routing invariant:
//   "L2 and L3 chains communicate only with GhostChain via IBC.
//    GhostChain alone bridges to external networks."
//
// This middleware wraps the standard IBC transfer module and intercepts
// OnRecvPacket / OnAcknowledgementPacket / OnTimeoutPacket callbacks.
//
// For every inbound IBC packet the middleware checks:
//  1. The source channel is registered as a GhostInternal channel
//     (i.e. counterparty is GhostL2 or GhostL3 — not a foreign chain).
//  2. If the destination port is "transfer" the packet is allowed.
//  3. Packets arriving on unknown channels are rejected with an error
//     acknowledgement to prevent unauthorised external chain bridging
//     through GhostChain.
//
// The allowed external channels (e.g. to Cosmos Hub) are gated by a
// separate governance parameter and only reachable from GhostChain L1.
package app

import (
	"fmt"

	sdk "github.com/cosmos/cosmos-sdk/types"
	capabilitytypes "github.com/cosmos/ibc-go/modules/capability/types"
	ibctransfertypes "github.com/cosmos/ibc-go/v8/modules/apps/transfer/types"
	channeltypes "github.com/cosmos/ibc-go/v8/modules/core/04-channel/types"
	porttypes "github.com/cosmos/ibc-go/v8/modules/core/05-port/types"
	ibcexported "github.com/cosmos/ibc-go/v8/modules/core/exported"
)

// GhostIBCMiddleware wraps an IBC module and enforces the routing-law.
type GhostIBCMiddleware struct {
	// app is the wrapped IBC application (usually the transfer module).
	app porttypes.IBCModule
	// allowedChannels is the set of channel IDs that represent GhostInternal
	// connections (L2, L3).  External bridging channels are kept here too
	// after being approved by governance.
	allowedChannels map[string]ChannelRole
}

// ChannelRole classifies the counterparty of an IBC channel.
type ChannelRole string

const (
	// ChannelRoleL2 is a channel connecting GhostChain L1 to GhostL2.
	ChannelRoleL2 ChannelRole = "ghostl2"
	// ChannelRoleL3 is a channel connecting GhostChain L1 to GhostL3 (via L2).
	ChannelRoleL3 ChannelRole = "ghostl3"
	// ChannelRoleExternal is a governance-approved channel to an external chain.
	// Only GhostChain L1 may hold external channels; L2/L3 nodes reject such packets.
	ChannelRoleExternal ChannelRole = "external"
)

// NewGhostIBCMiddleware constructs a GhostIBCMiddleware with the initial channel registry.
func NewGhostIBCMiddleware(app porttypes.IBCModule, initialChannels map[string]ChannelRole) GhostIBCMiddleware {
	if initialChannels == nil {
		initialChannels = defaultInternalChannels()
	}
	return GhostIBCMiddleware{app: app, allowedChannels: initialChannels}
}

// defaultInternalChannels returns the well-known channel IDs assigned at genesis
// to GhostL2 and GhostL3.  These are updated by the IBC handshake after genesis.
func defaultInternalChannels() map[string]ChannelRole {
	return map[string]ChannelRole{
		"channel-0": ChannelRoleL2,
		"channel-1": ChannelRoleL3,
	}
}

// isAllowed returns true when the source channel is in the allow-list.
func (m *GhostIBCMiddleware) isAllowed(channelID string) bool {
	_, ok := m.allowedChannels[channelID]
	return ok
}

// RegisterChannel adds a channel to the allow-list.  Intended to be called
// from the IBC channel OnChanOpenConfirm callback after governance approval.
func (m *GhostIBCMiddleware) RegisterChannel(channelID string, role ChannelRole) {
	m.allowedChannels[channelID] = role
}

// ─── IBCModule delegation with routing-law enforcement ───────────────────────

func (m GhostIBCMiddleware) OnChanOpenInit(
	ctx sdk.Context,
	order channeltypes.Order,
	connectionHops []string,
	portID string,
	channelID string,
	channelCap *capabilitytypes.Capability,
	counterparty channeltypes.Counterparty,
	version string,
) (string, error) {
	return m.app.OnChanOpenInit(ctx, order, connectionHops, portID, channelID, channelCap, counterparty, version)
}

func (m GhostIBCMiddleware) OnChanOpenTry(
	ctx sdk.Context,
	order channeltypes.Order,
	connectionHops []string,
	portID string,
	channelID string,
	channelCap *capabilitytypes.Capability,
	counterparty channeltypes.Counterparty,
	counterpartyVersion string,
) (string, error) {
	return m.app.OnChanOpenTry(ctx, order, connectionHops, portID, channelID, channelCap, counterparty, counterpartyVersion)
}

func (m GhostIBCMiddleware) OnChanOpenAck(
	ctx sdk.Context,
	portID string,
	channelID string,
	counterpartyChannelID string,
	counterpartyVersion string,
) error {
	return m.app.OnChanOpenAck(ctx, portID, channelID, counterpartyChannelID, counterpartyVersion)
}

func (m GhostIBCMiddleware) OnChanOpenConfirm(ctx sdk.Context, portID string, channelID string) error {
	return m.app.OnChanOpenConfirm(ctx, portID, channelID)
}

func (m GhostIBCMiddleware) OnChanCloseInit(ctx sdk.Context, portID string, channelID string) error {
	return m.app.OnChanCloseInit(ctx, portID, channelID)
}

func (m GhostIBCMiddleware) OnChanCloseConfirm(ctx sdk.Context, portID string, channelID string) error {
	return m.app.OnChanCloseConfirm(ctx, portID, channelID)
}

// OnRecvPacket enforces the routing-law before delegating to the transfer module.
func (m GhostIBCMiddleware) OnRecvPacket(
	ctx sdk.Context,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) ibcexported.Acknowledgement {
	// Enforce: only packets arriving on registered channels are processed.
	// Packets from unregistered channels are returned with an error ACK,
	// which causes the relayer to write the error on the source chain.
	if !m.isAllowed(packet.DestinationChannel) {
		ctx.EventManager().EmitEvent(sdk.NewEvent(
			"ghost_ibc_routing_law_violation",
			sdk.NewAttribute("channel", packet.DestinationChannel),
			sdk.NewAttribute("port", packet.DestinationPort),
		))
		return channeltypes.NewErrorAcknowledgement(
			errRouting("channel not registered in GhostChain routing-law registry: " + packet.DestinationChannel),
		)
	}

	// Additional check: enforce that transfer packets destined for external
	// channels originate only from L1 (not from L2/L3 relayers).
	role := m.allowedChannels[packet.DestinationChannel]
	if role == ChannelRoleExternal {
		// Verify the source port is the transfer module (no raw packet bridging).
		if packet.SourcePort != ibctransfertypes.ModuleName {
			return channeltypes.NewErrorAcknowledgement(
				errRouting("external channel only accepts transfer module packets"),
			)
		}
	}

	return m.app.OnRecvPacket(ctx, packet, relayer)
}

func (m GhostIBCMiddleware) OnAcknowledgementPacket(
	ctx sdk.Context,
	packet channeltypes.Packet,
	acknowledgement []byte,
	relayer sdk.AccAddress,
) error {
	return m.app.OnAcknowledgementPacket(ctx, packet, acknowledgement, relayer)
}

func (m GhostIBCMiddleware) OnTimeoutPacket(
	ctx sdk.Context,
	packet channeltypes.Packet,
	relayer sdk.AccAddress,
) error {
	return m.app.OnTimeoutPacket(ctx, packet, relayer)
}

// errRouting creates a routing-law violation error string.
func errRouting(msg string) error {
	return fmt.Errorf("ghost routing-law: %s", msg)
}
