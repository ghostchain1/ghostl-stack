# GhostChain L2 Roadmap (Opinionated)

## TL;DR
- Build fast now on the dev stack; migrate GhostL2 to OP Stack for production; evolve to hybrid OP + ZK for finality later.
- Keep GhostL3 as OP Stack app-chains on top of GhostL2.
- Preserve AI Guard/Relayer patterns; reuse them in the OP Stack batcher/finality path.

## Phases
1) Current: Polygon Edge / IBFT for local + GhostL3 prototyping; AI monitor/Guard wired in; relayers and rollup services running.
2) Production L2: GhostL2 = OP Stack optimistic rollup settling on GhostChain L1; data on L1 (EigenDA/Celestia later); fraud proofs + AI Guard on finalize.
3) App-chains: OP Stack L3s settling on GhostL2 (cheap gas, custom policies per app).
4) ZK Finality Upgrade: add validity proofs (Polygon CDK/zkEVM-style) to OP batches; no rewrite required.

## Why OP Stack
- Control: own sequencer/batcher/proposer/challenger; ideal for AI-driven pause/delay/throttle.
- L3-friendly: clean path for app-specific GhostL3s.
- EVM-perfect: zero tooling friction (Hardhat/Foundry/GhostWallet).
- Battle-tested: Optimism/Base/Zora/World Chain lineage.

## Not choosing (now)
- zkSync/Starknet: harder AI insertion, custom languages; revisit post-MVP.
- Polygon Edge alone: great for dev; not a rollup; keep for local flows only.
- Arbitrum Nitro: strong tech but less flexible for deep AI enforcement experiments.

## Concrete Stack
| Layer      | Tooling                        |
| ---------- | ------------------------------ |
| L2         | OP Stack (Optimistic Rollup)   |
| L3         | OP Stack (app chains)          |
| Dev Chain  | Polygon Edge (current)         |
| Settlement | GhostChain L1                  |
| DA (later) | EigenDA / Celestia             |
| Contracts  | Solidity                       |
| AI Guard   | Node + on-chain policy hooks   |
| Relayers   | Custom (existing)              |

## Immediate Next Steps
- Stand up an OP Stack devnet alongside current Edge devnet.
- Port deploy scripts to OP Stack chains; emit envs for Guard/Relayer/Proposers.
- Define AI hook points in batcher/finality (pause/delay/threshold adjustments).
- Keep GhostL3 as OP Stack app-chain template anchored on GhostL2. 
