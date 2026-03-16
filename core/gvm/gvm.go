// Package gvm implements the Ghost Virtual Machine (GVM).
// GVM is the GhostChain-native execution environment for GRC smart contracts.
// It replaces EVM semantics with Ghost-specific gas scheduling, opcode set,
// and integration with the GhostBrain AI layer for adaptive gas pricing.
package gvm

import (
	"encoding/binary"
	"errors"
	"math/big"
)

// ChainID constants for GhostChain layers
const (
	ChainIDL1 = 14000101 // GhostChain L1
	ChainIDL2 = 901      // GhostL2
	ChainIDL3 = 903      // GhostL3
)

// GSTUnit is the smallest denomination of GST (1e18 wei)
var GSTUnit = new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

// Opcode represents a GVM opcode
type Opcode byte

const (
	// Arithmetic
	OpADD  Opcode = 0x01
	OpSUB  Opcode = 0x03
	OpMUL  Opcode = 0x02
	OpDIV  Opcode = 0x04
	OpMOD  Opcode = 0x06
	OpEXP  Opcode = 0x0a

	// Comparison & Bitwise
	OpLT     Opcode = 0x10
	OpGT     Opcode = 0x11
	OpEQ     Opcode = 0x14
	OpAND    Opcode = 0x16
	OpOR     Opcode = 0x17
	OpXOR    Opcode = 0x18
	OpNOT    Opcode = 0x19
	OpSHR    Opcode = 0x1c
	OpSHL    Opcode = 0x1b

	// Memory
	OpMLOAD  Opcode = 0x51
	OpMSTORE Opcode = 0x52
	OpMSTORE8 Opcode = 0x53

	// Storage (GhostChain persistent key-value)
	OpSLOAD  Opcode = 0x54
	OpSSTORE Opcode = 0x55

	// Control flow
	OpJUMP     Opcode = 0x56
	OpJUMPI    Opcode = 0x57
	OpJUMPDEST Opcode = 0x5b
	OpSTOP     Opcode = 0x00
	OpRETURN   Opcode = 0xf3
	OpREVERT   Opcode = 0xfd

	// Stack
	OpPUSH1  Opcode = 0x60
	OpPUSH32 Opcode = 0x7f
	OpPOP    Opcode = 0x50
	OpDUP1   Opcode = 0x80
	OpSWAP1  Opcode = 0x90

	// Environment
	OpCALLER    Opcode = 0x33
	OpCALLVALUE Opcode = 0x34
	OpORIGIN    Opcode = 0x32
	OpGASPRICE  Opcode = 0x3a
	OpCHAINID   Opcode = 0x46
	OpSELFBALANCE Opcode = 0x47

	// Hashing
	OpKECCAK256 Opcode = 0x20

	// Call
	OpCALL         Opcode = 0xf1
	OpSTATICCALL   Opcode = 0xfa
	OpDELEGATECALL Opcode = 0xf4
	OpCREATE       Opcode = 0xf0
	OpCREATE2      Opcode = 0xf5

	// Logging (GRC events)
	OpLOG0 Opcode = 0xa0
	OpLOG1 Opcode = 0xa1
	OpLOG2 Opcode = 0xa2
	OpLOG3 Opcode = 0xa3
	OpLOG4 Opcode = 0xa4

	// Ghost-specific extensions
	OpGHOSTBRAIN    Opcode = 0xe0 // Query GhostBrain oracle
	OpGHOSTIDENTITY Opcode = 0xe1 // GNS lookup
	OpGHOSTBRIDGE   Opcode = 0xe2 // Initiate cross-layer bridge transfer
)

// GasSchedule defines GVM gas costs per opcode
type GasSchedule struct {
	Base         uint64
	VeryLow      uint64
	Low          uint64
	Mid          uint64
	High         uint64
	JumpDest     uint64
	Balance      uint64
	ExtCode      uint64
	CallValue    uint64
	Storage      uint64
	StorageStore uint64
	Create       uint64
	Call         uint64
	GhostBrain   uint64 // AI oracle
	GhostBridge  uint64 // Cross-layer bridge
}

// DefaultGasSchedule returns the canonical GhostChain gas schedule
func DefaultGasSchedule() GasSchedule {
	return GasSchedule{
		Base:         2,
		VeryLow:      3,
		Low:          5,
		Mid:          8,
		High:         10,
		JumpDest:     1,
		Balance:      400,
		ExtCode:      700,
		CallValue:    9000,
		Storage:      800,
		StorageStore: 20000,
		Create:       32000,
		Call:         700,
		GhostBrain:   5000, // AI oracle call
		GhostBridge:  15000, // Cross-layer bridge
	}
}

// Stack is a 1024-element big.Int stack
type Stack struct {
	data [1024]*big.Int
	size int
}

func (s *Stack) Push(val *big.Int) error {
	if s.size >= 1024 {
		return errors.New("gvm: stack overflow")
	}
	s.data[s.size] = new(big.Int).Set(val)
	s.size++
	return nil
}

func (s *Stack) Pop() (*big.Int, error) {
	if s.size == 0 {
		return nil, errors.New("gvm: stack underflow")
	}
	s.size--
	return s.data[s.size], nil
}

func (s *Stack) Peek() (*big.Int, error) {
	if s.size == 0 {
		return nil, errors.New("gvm: stack empty")
	}
	return s.data[s.size-1], nil
}

// Memory is the GVM linear memory (byte-addressable)
type Memory struct {
	data []byte
}

func (m *Memory) Ensure(offset, size int) {
	needed := offset + size
	if needed > len(m.data) {
		n := make([]byte, needed)
		copy(n, m.data)
		m.data = n
	}
}

func (m *Memory) Set(offset int, data []byte) {
	m.Ensure(offset, len(data))
	copy(m.data[offset:], data)
}

func (m *Memory) Get(offset, size int) []byte {
	m.Ensure(offset, size)
	return m.data[offset : offset+size]
}

// Storage is a persistent key-value store (32-byte key → 32-byte value)
type Storage map[[32]byte][32]byte

// ExecutionContext holds the inputs to a GVM execution
type ExecutionContext struct {
	Code        []byte
	Caller      [20]byte
	Origin      [20]byte
	Value       *big.Int    // GST value in wei
	Gas         uint64
	GasPrice    *big.Int
	Input       []byte
	ChainID     uint64
	Storage     Storage
	GasSchedule GasSchedule
}

// ExecutionResult is returned by GVM.Execute
type ExecutionResult struct {
	ReturnData []byte
	GasUsed    uint64
	GasRemaining uint64
	Reverted   bool
	Err        error
	Logs       []Log
}

// Log represents a GRC event emitted by a contract
type Log struct {
	Topics [][]byte
	Data   []byte
}

// GVM is the Ghost Virtual Machine
type GVM struct {
	schedule GasSchedule
}

// New creates a new GVM with the default gas schedule
func New() *GVM {
	return &GVM{schedule: DefaultGasSchedule()}
}

// NewWithSchedule creates a GVM with a custom gas schedule
func NewWithSchedule(s GasSchedule) *GVM {
	return &GVM{schedule: s}
}

// Execute runs bytecode in the given execution context
func (gvm *GVM) Execute(ctx *ExecutionContext) *ExecutionResult {
	stack  := &Stack{}
	memory := &Memory{}
	gas    := ctx.Gas
	pc     := 0
	code   := ctx.Code
	var logs []Log

	consumeGas := func(cost uint64) error {
		if gas < cost {
			return errors.New("gvm: out of gas")
		}
		gas -= cost
		return nil
	}

	for pc < len(code) {
		op := Opcode(code[pc])

		switch op {
		case OpSTOP:
			return &ExecutionResult{GasUsed: ctx.Gas - gas, GasRemaining: gas, Logs: logs}

		case OpADD:
			if err := consumeGas(gvm.schedule.VeryLow); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			a, _ := stack.Pop()
			b, _ := stack.Pop()
			_ = stack.Push(new(big.Int).Add(a, b))

		case OpSUB:
			if err := consumeGas(gvm.schedule.VeryLow); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			a, _ := stack.Pop()
			b, _ := stack.Pop()
			_ = stack.Push(new(big.Int).Sub(a, b))

		case OpMUL:
			if err := consumeGas(gvm.schedule.Low); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			a, _ := stack.Pop()
			b, _ := stack.Pop()
			_ = stack.Push(new(big.Int).Mul(a, b))

		case OpDIV:
			if err := consumeGas(gvm.schedule.Low); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			a, _ := stack.Pop()
			b, _ := stack.Pop()
			if b.Sign() == 0 {
				_ = stack.Push(big.NewInt(0))
			} else {
				_ = stack.Push(new(big.Int).Div(a, b))
			}

		case OpCHAINID:
			if err := consumeGas(gvm.schedule.Base); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			_ = stack.Push(new(big.Int).SetUint64(ctx.ChainID))

		case OpCALLER:
			if err := consumeGas(gvm.schedule.Base); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			v := new(big.Int).SetBytes(ctx.Caller[:])
			_ = stack.Push(v)

		case OpCALLVALUE:
			if err := consumeGas(gvm.schedule.Base); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			_ = stack.Push(new(big.Int).Set(ctx.Value))

		case OpPOP:
			if err := consumeGas(gvm.schedule.Base); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			_, _ = stack.Pop()

		case OpJUMPDEST:
			if err := consumeGas(gvm.schedule.JumpDest); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}

		case OpRETURN:
			if err := consumeGas(gvm.schedule.VeryLow); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			offset, _ := stack.Pop()
			size, _   := stack.Pop()
			ret := memory.Get(int(offset.Int64()), int(size.Int64()))
			return &ExecutionResult{
				ReturnData:   ret,
				GasUsed:      ctx.Gas - gas,
				GasRemaining: gas,
				Logs:         logs,
			}

		case OpREVERT:
			if err := consumeGas(gvm.schedule.VeryLow); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			offset, _ := stack.Pop()
			size, _   := stack.Pop()
			ret := memory.Get(int(offset.Int64()), int(size.Int64()))
			return &ExecutionResult{
				ReturnData:   ret,
				GasUsed:      ctx.Gas - gas,
				GasRemaining: gas,
				Reverted:     true,
				Err:          errors.New("gvm: execution reverted"),
				Logs:         logs,
			}

		case OpGHOSTBRAIN:
			// Ghost-specific: AI oracle call, consumes extra gas
			if err := consumeGas(gvm.schedule.GhostBrain); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			// Push oracle response placeholder (1 = success)
			_ = stack.Push(big.NewInt(1))

		case OpGHOSTBRIDGE:
			// Ghost-specific: initiate bridge transfer
			if err := consumeGas(gvm.schedule.GhostBridge); err != nil {
				return &ExecutionResult{Reverted: true, Err: err}
			}
			_ = stack.Push(big.NewInt(1))

		default:
			// PUSH1..PUSH32
			if op >= OpPUSH1 && op <= OpPUSH32 {
				n := int(op-OpPUSH1) + 1
				if err := consumeGas(gvm.schedule.VeryLow); err != nil {
					return &ExecutionResult{Reverted: true, Err: err}
				}
				if pc+n >= len(code) {
					return &ExecutionResult{Reverted: true, Err: errors.New("gvm: PUSH out of bounds")}
				}
				val := new(big.Int).SetBytes(code[pc+1 : pc+1+n])
				_ = stack.Push(val)
				pc += n
			}
		}

		pc++
	}

	return &ExecutionResult{GasUsed: ctx.Gas - gas, GasRemaining: gas, Logs: logs}
}

// Uint64FromBytes decodes big-endian bytes to uint64
func Uint64FromBytes(b []byte) uint64 {
	if len(b) < 8 {
		padded := make([]byte, 8)
		copy(padded[8-len(b):], b)
		b = padded
	}
	return binary.BigEndian.Uint64(b)
}
