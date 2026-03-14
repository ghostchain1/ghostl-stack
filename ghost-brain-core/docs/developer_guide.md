# GhostBrain Developer Guide

This guide covers everything you need to start contributing to
the GhostBrain AI compute platform.

---

## Prerequisites

| Dependency     | Version         | Purpose |
|---|---|---|
| Node.js        | >=22.21.0 <23   | Runtime, integration layer |
| npm            | 10.9.4          | Package management (pnpm unsupported) |
| Rust           | stable (≥1.78)  | Security subsystem (bootloader, attestation) |
| LLVM / Clang   | 18              | Compiler toolchain, MLIR |
| C++ compiler   | GCC ≥12 or Clang 18 | Reliability, simulator |
| Python         | 3.11            | Benchmarks, simulators |
| Docker + Compose | 24 / 2.27    | Local devnet |
| HashiCorp Vault | 1.16+          | Key management (dev mode locally) |

---

## Quick Start

```bash
# 1. Clone the stack
git clone https://your-internal-repo/ghostl-stack.git
cd ghostl-stack/ghost-brain-core

# 2. Install Node dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Build Rust security subsystem
cd security
cargo build --release
cd ..

# 5. Build C++ reliability + simulator
cd reliability
g++ -std=c++17 -O2 -o ecc_controller ecc_controller.cpp && echo "ECC OK"
g++ -std=c++17 -O2 -o fault_detector fault_detector.cpp && echo "FaultDet OK"
g++ -std=c++17 -O2 -pthread -o health_monitor health_monitor.cpp && echo "Health OK"
cd ..

# 6. Install Python benchmarks
python3 -m pip install numpy matplotlib scipy

# 7. Start local dev stack (all services + Vault + Prometheus + Grafana)
docker compose -f infrastructure/compose/docker-compose-ghostbrain.yml up -d

# 8. Verify health
curl http://localhost:7900/health
```

---

## Environment Variables

Copy `.env.example` to `.env` and set these:

| Variable                  | Default                          | Required | Description |
|---|---|---|---|
| `GHOSTCHAIN_L1_RPC`       | `http://localhost:18545`         | Yes      | GhostChain L1 JSON-RPC |
| `GHOSTL2_RPC`             | `http://localhost:29545`         | Yes      | GhostL2 sequencer RPC |
| `GHOSTL3_RPC`             | `http://localhost:39545`         | Yes      | GhostL3 inference chain RPC |
| `GHOSTBRAIN_PORT`         | `7900`                           | No       | API listen port |
| `GHOSTBRAIN_MGMT_PORT`    | `7901`                           | No       | Management sideband port |
| `GHOSTBRAIN_DEVICE_ID`    | —                                | Yes      | eFuse chip UUID (hex) |
| `VAULT_ADDR`              | `http://localhost:8200`          | Yes      | HashiCorp Vault address |
| `VAULT_TOKEN`             | —                                | Yes      | Vault auth token (never commit) |
| `SIGNING_RELAY_URL`       | `http://localhost:7910`          | Yes      | Human-operated signing relay |
| `GHOSTSCAN_INDEXER_URL`   | `http://localhost:8190`          | No       | GhostScan event indexer |
| `INFERENCE_GW_L3`         | —                                | Yes      | L3 inference gateway contract |
| `EVENT_LOG_HMAC_KEY`      | —                                | Yes      | 32-byte hex HMAC key for event log |
| `EVENT_LOG_DIR`           | `/var/log/ghostbrain`            | No       | Event log directory |

### Chain IDs (informational, do not override in production)

| Chain    | ID       | RPC Port |
|---|---|---|
| GhostChain L1 | 14000101 | 18545 |
| GhostL2       | 901      | 29545 |
| GhostL3       | 903      | 39545 |

---

## Running Tests

### TypeScript

```bash
# Type-check without emitting
npx tsc --noEmit

# Lint
npx eslint runtime/ integration/ security/

# Unit tests
npm test
```

### Rust

```bash
cd security
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```

### C++

```bash
# ECC self-test (injects single-bit error, verifies correction)
./reliability/ecc_controller --self-test

# Fault detector (runs POR tests on synthetic SRAM)
./reliability/fault_detector --self-test

# Health monitor (runs 1 collection cycle, prints JSON)
./reliability/health_monitor --once
```

### Python Benchmarks (smoke tests)

```bash
python3 benchmarks/mlperf/ghostbrain_mlperf.py --iterations 2
python3 benchmarks/transformer/llama_benchmark.py --layers 2 --tokens 16
python3 benchmarks/recommender/embedding_benchmark.py --dim 64 --batch 8
```

---

## Project Structure

```
ghost-brain-core/
├── architecture/         # Hardware specs, microarchitecture docs
├── compiler/             # GhostTensor MLIR compiler (C++ / LLVM 18)
│   ├── dialect/          # GhostTensor dialect definition (.td, .cpp, .h)
│   ├── transforms/       # Fusion, tiling, quantize, sparsity passes
│   └── backend/          # CPU / GPU / FPGA / chiplet emitters
├── runtime/              # TypeScript inference runtime (port 7900)
│   ├── api_server.ts     # Express 5 API
│   ├── inference_engine.ts
│   ├── kv_cache.ts       # Paged KV cache
│   └── scheduler.ts      # Governance-priority scheduler
├── simulator/            # C++ cycle-accurate simulator
├── benchmarks/           # Python MLPerf + transformer + recommender
├── hardware/             # Verilog RTL (systolic array, DMA, NoC)
├── security/             # Rust secure boot + TS attestation + encryption
│   ├── secure_boot/      # bootloader.rs, firmware_verifier.rs
│   ├── attestation/      # chip_identity.rs, remote_attestation.ts
│   └── encryption/       # memory_encryption.ts, key_manager.ts
├── reliability/          # ECC, fault detection, health monitor (C++)
├── integration/          # GhostChain bridge, L2 runtime, L3 gateway (TS)
├── infrastructure/       # Docker, Compose, Kubernetes manifests
├── ci/                   # GitHub Actions pipelines
└── docs/                 # Markdown documentation
```

---

## Adding a New Model to the Inference Runtime

1. **Export the model** to GhostIR (MLIR text) using the Python front-end:

   ```python
   from ghostbrain.compiler import export_model
   export_model(model, "my_model.ghost.mlir", target="chiplet")
   ```

2. **Compile** via the daemon:

   ```bash
   curl -X POST http://localhost:7930/v1/compile \
     -H "Content-Type: application/json" \
     -d '{"model_id":"my-model","source":"<mlir...>","target":"chiplet","opts":{"quantize":true}}'
   ```

   Note the returned `kernel_cid`.

3. **Register the kernel CID** with the runtime:

   ```bash
   curl -X POST http://localhost:7900/v1/models/register \
     -H "Content-Type: application/json" \
     -d '{"model_id":"my-model","kernel_cid":"bafyrei...","description":"..."}'
   ```

4. **Call inference**:

   ```bash
   curl -X POST http://localhost:7900/v1/infer \
     -H "Content-Type: application/json" \
     -d '{"model_id":"my-model","input":{"tokens":[1,2,3]},"max_tokens":64}'
   ```

5. **Governance proposal** (for production promotion — human-ratified):

   The inference runtime will not run a model not listed in the L1
   firmware manifest. Submit a governance proposal via
   `POST /v1/governance/propose` with `target_contract` set to the
   firmware registry (`0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422`).

---

## Chain Integration Patterns

### Reading from L1

```typescript
import { fetchFirmwareManifest, getLatestBlock } from "../integration/ghostchain_bridge";

const block   = await getLatestBlock();
const manifest = await fetchFirmwareManifest();
```

Always use `ghost_call` (not `eth_call`). This is enforced by the
`ghostCall()` helper in `integration/ghostchain_bridge.ts`.

### Submitting a Governance Proposal

```typescript
import { submitGovernanceProposal } from "../integration/ghostchain_bridge";

// GhostBrain constructs the calldata; a human operator signs via relay.
const txHash = await submitGovernanceProposal({
  target:   "0x7B3Be2...",
  calldata: "0xdeadbeef...",
  value:    0n,
  description: "Register kernel CID for my-model v1.0"
});
// Returns the relay's pending tx hash. On-chain execution requires
// governance quorum (GhostChainGovernor timelock).
```

### Never Do

- `import { ethers } from "ethers"` — banned; use `ghostCall()` helpers
- Send GST or any token directly — route through signing relay
- Use `eth_call` — use `ghost_call`
- Hardcode private keys — use Vault + signing relay
- Reference external (non-GhostChain) mainnet addresses or chain IDs

---

## Security Rules

1. **No private keys on GhostBrain.** All signing is delegated to the
   human-operated signing relay at `SIGNING_RELAY_URL`. GhostBrain only
   constructs unsigned calldatas.

2. **GST-only gas.** The signing relay enforces `gasToken:"GST"` on every
   submitted transaction. Non-GST transactions are rejected.

3. **`ghost_call`, not `eth_call`.** GhostChain uses its own RPC namespace.
   Using `eth_call` will return an error from the node.

4. **Governance = human quorum.** GhostBrain may *propose*; humans must
   *ratify*. No autonomous on-chain execution without `GhostChainGovernor`
   quorum threshold and timelock.

5. **Event log integrity.** All AI decisions are written to the
   HMAC-SHA256 signed append-only JSONL log via `ai_event_logger.ts`.
   The HMAC key is stored in Vault, never in env files or source code.

---

## Debugging

### Runtime not starting

```bash
# Check environment
node -e "require('./runtime/api_server')" 2>&1 | head -30

# Check Vault reachability
curl $VAULT_ADDR/v1/sys/health

# Check L1 RPC
curl -X POST $GHOSTCHAIN_L1_RPC \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ghost_getBlockByNumber","params":["latest",false],"id":1}'
```

### ECC alert firing continuously

Check `ecc_controller` CE counter. If `total_ce_count > 1000`, a bank
may have a stuck bit. Run `fault_detector --self-test` to confirm.
The 24-hour scrub thread corrects in-situ; if CEs continue to accumulate
faster than scrub corrects, mark the bank offline and submit a hardware
alert governance proposal via `POST /v1/governance/propose`.

### L2 finality divergence alert

If `ghostl2_runtime.ts` emits `⚠ L2 block far ahead of L1 submission`
with block gap > 1000, check:
1. L1 batcher is running: `docker compose ps ghostl2-batcher`
2. L1 finality oracle: `curl http://localhost:18545` (selector `3c69b7bf`)
3. Network connectivity between L2 op-node and L1

---

## Contributing

1. Branch from `main` with prefix `feat/`, `fix/`, `chore/`, or `doc/`.
2. All TypeScript must pass `npx tsc --noEmit` and `eslint` with zero errors.
3. All Rust must pass `cargo clippy -- -D warnings` and `cargo fmt --check`.
4. New REST endpoints must be documented in `docs/runtime_api.md`.
5. Security-sensitive changes (key management, attestation) require two
   human reviewers from the GhostChain core team.
6. Run `npm run brand:full` from the ghostl-stack root before opening a PR.
