# GhostChain — Cosmos SDK sovereign chain
# Makefile

SHELL := /bin/bash
GOPATH ?= $(shell go env GOPATH)
BINARY  := ghostchaind
BUILD_DIR := ./build
PACKAGE := github.com/ghostchain1/ghostchain

# Chain defaults
CHAIN_ID       ?= ghostchain-1
MONIKER        ?= ghostchain-validator
GHOST_HOME     ?= $(HOME)/.ghostchaind
AI_ORACLE_ADDR ?= ghost1qm5aqf0qy5mn3r0t5j2xm3m2m3m2m3m2m3m2qu

# ─── Build targets ───────────────────────────────────────────────────────────

.PHONY: all build install clean test lint

all: build

## build: compile ghostchaind binary into ./build/
build:
	@echo "Building ghostchaind..."
	@mkdir -p $(BUILD_DIR)
	@go build \
		-ldflags="-X $(PACKAGE)/app.Version=$(shell git describe --tags --always 2>/dev/null || echo v1.0.0)" \
		-o $(BUILD_DIR)/$(BINARY) ./cmd/ghostchaind
	@echo "Binary available at: $(BUILD_DIR)/$(BINARY)"

## install: install ghostchaind into GOPATH/bin
install:
	@echo "Installing ghostchaind..."
	@go install ./cmd/ghostchaind

## clean: remove build artefacts
clean:
	@rm -rf $(BUILD_DIR)

# ─── Test targets ────────────────────────────────────────────────────────────

## test: run all Go unit tests
test:
	@go test -v -race -count=1 ./...

## test-keeper: run only keeper tests
test-keeper:
	@go test -v -count=1 ./x/ghost/... ./x/ghostgov/... ./x/gsttoken/...

## test-integration: run integration tests (requires a running chain)
test-integration:
	@go test -v -tags=integration ./tests/...

# ─── Lint ────────────────────────────────────────────────────────────────────

## lint: run golangci-lint
lint:
	@which golangci-lint > /dev/null 2>&1 || go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@golangci-lint run --timeout 10m ./...

# ─── Chain initialisation ─────────────────────────────────────────────────────

## init: initialise a single-node devnet
init:
	@$(BUILD_DIR)/$(BINARY) init $(MONIKER) --chain-id $(CHAIN_ID) --home $(GHOST_HOME)
	@$(BUILD_DIR)/$(BINARY) keys add validator --keyring-backend test --home $(GHOST_HOME)
	@$(BUILD_DIR)/$(BINARY) genesis add-genesis-account validator 1000000000ugst \
		--keyring-backend test --home $(GHOST_HOME)
	@$(BUILD_DIR)/$(BINARY) genesis gentx validator 100000000ugst \
		--chain-id $(CHAIN_ID) --keyring-backend test --home $(GHOST_HOME)
	@$(BUILD_DIR)/$(BINARY) genesis collect-gentxs --home $(GHOST_HOME)
	@echo "Chain initialised at $(GHOST_HOME)"

## start: start the single-node devnet
start:
	@$(BUILD_DIR)/$(BINARY) start \
		--home $(GHOST_HOME) \
		--minimum-gas-prices "0ugst" \
		--rpc.laddr tcp://0.0.0.0:26657 \
		--grpc.address 0.0.0.0:9090 \
		--api.address tcp://0.0.0.0:1317 \
		--api.enable true \
		--api.swagger true

## stop: send SIGTERM to ghostchaind
stop:
	@pkill ghostchaind || true

# ─── Genesis helpers ──────────────────────────────────────────────────────────

## genesis-validate: validate the current genesis.json
genesis-validate:
	@$(BUILD_DIR)/$(BINARY) genesis validate-genesis --home $(GHOST_HOME)

# ─── IBC channel setup ────────────────────────────────────────────────────────

## ibc-channels: list open IBC channels
ibc-channels:
	@$(BUILD_DIR)/$(BINARY) query ibc channel channels \
		--node tcp://localhost:26657 --output json | jq .

# ─── Module query shortcuts ──────────────────────────────────────────────────

## ghost-status: show ghost module stats (nullifier count etc.)
ghost-status:
	@$(BUILD_DIR)/$(BINARY) query ghost status \
		--node tcp://localhost:26657 --output json

## gov-proposals: list ghostgov proposals
gov-proposals:
	@$(BUILD_DIR)/$(BINARY) query ghostgov proposals \
		--node tcp://localhost:26657 --output json

# ─── Container targets ────────────────────────────────────────────────────────

## docker-build: build the ghostchaind Docker image
docker-build:
	@docker build -t ghostchain/ghostchaind:latest \
		--build-arg CHAIN_ID=$(CHAIN_ID) \
		-f Dockerfile .

## docker-run: run the ghostchaind container (devnet mode)
docker-run:
	@docker run -it --rm \
		-p 26657:26657 -p 9090:9090 -p 1317:1317 \
		-e GHOST_AI_ORACLE_ADDR=$(AI_ORACLE_ADDR) \
		ghostchain/ghostchaind:latest

# ─── Proto generation ────────────────────────────────────────────────────────

## proto-gen: generate protobuf + gRPC Go code from proto/ directory
proto-gen:
	@which buf > /dev/null 2>&1 || (echo "Install buf: https://buf.build/docs/installation" && exit 1)
	@buf generate

# ─── Help ────────────────────────────────────────────────────────────────────

## help: print this help message
help:
	@echo "GhostChain Makefile targets:"
	@grep -E '^##' Makefile | sed 's/## /  /'
