// Package bridge implements the GhostChain cross-layer bridge engine.
// Handles lock/mint/burn/release flows for GST and GRC tokens
// across L1 (14000101) → L2 (901) → L3 (903).
// Routing law: L3 → L2 → L1 (never direct L3 → L1).
package bridge

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
	"time"
)

// Layer constants
const (
	LayerL1 = 14000101
	LayerL2 = 901
	LayerL3 = 903
)

// Canonical bridge contract addresses
const (
	L2L3BridgeAddr  = "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2"
	L1RollupForL2   = "0xad32D5C2Da9f4159C4cc98686C005852b3905355"
	L2RollupForL3   = "0x130A46b6E41DB6E1e18fb9c759F223c459190e90"
	FinalityOracleL1 = "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422"
	FinalityOracleL2 = "0x650aEF4b63095e4EDe581BC79CdeA927e3ba553A"
	FinalityOracleL3 = "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127"
)

// Direction defines the cross-layer transfer direction
type Direction uint8

const (
	DirectionL1ToL2 Direction = iota
	DirectionL2ToL1
	DirectionL2ToL3
	DirectionL3ToL2 // L3 → L2 is valid; L3 → L1 is ROUTING LAW VIOLATION
)

func (d Direction) String() string {
	switch d {
	case DirectionL1ToL2:
		return "L1→L2"
	case DirectionL2ToL1:
		return "L2→L1"
	case DirectionL2ToL3:
		return "L2→L3"
	case DirectionL3ToL2:
		return "L3→L2"
	default:
		return "unknown"
	}
}

// RoutingLawCheck verifies the routing law constraint:
//   L3 must not directly interact with L1.
func RoutingLawCheck(srcChain, dstChain uint64) error {
	if srcChain == LayerL3 && dstChain == LayerL1 {
		return errors.New("bridge: routing law violation — L3 cannot directly interact with L1; route through L2")
	}
	if srcChain == LayerL1 && dstChain == LayerL3 {
		return errors.New("bridge: routing law violation — L1 cannot directly target L3; route through L2")
	}
	return nil
}

// BridgeStatus is the status of a cross-layer transfer
type BridgeStatus uint8

const (
	StatusInitiated  BridgeStatus = iota
	StatusProven
	StatusFinalized
	StatusFailed
)

func (s BridgeStatus) String() string {
	switch s {
	case StatusInitiated:
		return "initiated"
	case StatusProven:
		return "proven"
	case StatusFinalized:
		return "finalized"
	case StatusFailed:
		return "failed"
	default:
		return "unknown"
	}
}

// BridgeMessage represents a cross-layer message
type BridgeMessage struct {
	MessageID   [32]byte
	Direction   Direction
	SrcChain    uint64
	DstChain    uint64
	Sender      [20]byte
	Recipient   [20]byte
	Amount      *big.Int  // GST wei
	Data        []byte    // arbitrary message payload
	Status      BridgeStatus
	InitiatedAt time.Time
	FinalizedAt *time.Time
	ProofHash   [32]byte
}

// GenerateMessageID creates a deterministic message ID from the transfer params
func GenerateMessageID(sender, recipient [20]byte, amount *big.Int, srcChain, dstChain uint64, nonce uint64) [32]byte {
	h := sha256.New()
	h.Write(sender[:])
	h.Write(recipient[:])
	h.Write([]byte(amount.String()))
	var buf [8]byte
	for shift := 56; shift >= 0; shift -= 8 {
		buf[(56-shift)/8] = byte(srcChain >> uint(shift))
	}
	h.Write(buf[:])
	for shift := 56; shift >= 0; shift -= 8 {
		buf[(56-shift)/8] = byte(dstChain >> uint(shift))
	}
	h.Write(buf[:])
	for shift := 56; shift >= 0; shift -= 8 {
		buf[(56-shift)/8] = byte(nonce >> uint(shift))
	}
	h.Write(buf[:])

	var id [32]byte
	copy(id[:], h.Sum(nil))
	return id
}

// MessageStore maintains pending bridge messages
type MessageStore struct {
	mu       sync.RWMutex
	messages map[[32]byte]*BridgeMessage
	nonce    uint64
}

func NewMessageStore() *MessageStore {
	return &MessageStore{
		messages: make(map[[32]byte]*BridgeMessage),
	}
}

// Initiate creates a new cross-layer bridge message
func (ms *MessageStore) Initiate(
	direction Direction,
	srcChain, dstChain uint64,
	sender, recipient [20]byte,
	amount *big.Int,
	data []byte,
) (*BridgeMessage, error) {
	if err := RoutingLawCheck(srcChain, dstChain); err != nil {
		return nil, err
	}
	if amount.Sign() <= 0 {
		return nil, errors.New("bridge: amount must be positive")
	}

	ms.mu.Lock()
	defer ms.mu.Unlock()

	ms.nonce++
	msgID := GenerateMessageID(sender, recipient, amount, srcChain, dstChain, ms.nonce)

	msg := &BridgeMessage{
		MessageID:   msgID,
		Direction:   direction,
		SrcChain:    srcChain,
		DstChain:    dstChain,
		Sender:      sender,
		Recipient:   recipient,
		Amount:      new(big.Int).Set(amount),
		Data:        data,
		Status:      StatusInitiated,
		InitiatedAt: time.Now(),
	}

	ms.messages[msgID] = msg
	return msg, nil
}

// Prove marks a message as proven (withdrawal proof submitted)
func (ms *MessageStore) Prove(msgID [32]byte, proofHash [32]byte) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	msg, ok := ms.messages[msgID]
	if !ok {
		return errors.New("bridge: message not found")
	}
	if msg.Status != StatusInitiated {
		return errors.New("bridge: message not in initiated state")
	}

	msg.Status    = StatusProven
	msg.ProofHash = proofHash
	return nil
}

// Finalize marks a message as finalized (funds released on destination)
func (ms *MessageStore) Finalize(msgID [32]byte) error {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	msg, ok := ms.messages[msgID]
	if !ok {
		return errors.New("bridge: message not found")
	}
	if msg.Status != StatusProven {
		return errors.New("bridge: message must be proven before finalizing")
	}

	t := time.Now()
	msg.Status      = StatusFinalized
	msg.FinalizedAt = &t
	return nil
}

// Get retrieves a bridge message by ID
func (ms *MessageStore) Get(msgID [32]byte) (*BridgeMessage, bool) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()
	msg, ok := ms.messages[msgID]
	return msg, ok
}

// Pending returns all messages in the initiated or proven state
func (ms *MessageStore) Pending() []*BridgeMessage {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	var pending []*BridgeMessage
	for _, msg := range ms.messages {
		if msg.Status == StatusInitiated || msg.Status == StatusProven {
			pending = append(pending, msg)
		}
	}
	return pending
}

// MessageIDHex returns hex-encoded message ID
func MessageIDHex(id [32]byte) string {
	return "0x" + hex.EncodeToString(id[:])
}
