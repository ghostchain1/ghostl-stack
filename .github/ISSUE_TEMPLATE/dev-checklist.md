---
name: "Dashboard Dev Checklist"
about: "Track build items for the Blockchain Management Dashboard (L1–L3 / Validator Operator)"
title: "[Dashboard] Dev checklist"
labels: ["dashboard", "tracking"]
assignees: ""
---

# DEV CHECKLIST — Blockchain Management Dashboard (L1–L3 / Validator Operator)

## ✅ Project Setup & Standards

- [ ] Monorepo structure created (`apps/web`, `apps/api`, `packages/sdk`, `packages/ui`)
- [ ] TypeScript strict mode enabled (web + api)
- [ ] ESLint + Prettier + EditorConfig configured
- [ ] Env management: `.env.example` + schema validation (zod/joi)
- [ ] Logging standard (structured JSON logs) + correlation IDs
- [ ] Error handling standard + global error boundary (web)
- [ ] API versioning strategy (e.g., `/v1/`)
- [ ] Secrets strategy documented (Vault/HSM/KMS integration points)
- [ ] CI pipeline scaffold (lint, test, build, security scan)

**Done when:** project boots locally in 1 command, lint/test/build pass clean.

---

## 🧭 Core Dashboard Structure (Shell + Navigation)

- [ ] App shell layout (top bar, side nav, content area)
- [ ] Global search (validators, tx, blocks, contracts, wallets)
- [ ] Environment switcher (Mainnet/Testnet/Dev)
- [ ] Multi-chain / multi-rollup selector (L1/L2/L3)
- [ ] Status strip: chain health, RPC health, indexer health, bridge health
- [ ] “Quick Actions” menu (restart node, pause bridge, rotate key, etc.)
- [ ] Permissions-aware UI rendering (RBAC hides forbidden controls)

**Done when:** navigation is stable, routes protected, all pages load with mock data.

---

## 🔐 Identity, Access & Security

### Authentication & Authorization

- [ ] Wallet login (MetaMask + WalletConnect)
- [ ] OAuth login (Google/GitHub) OR Enterprise SSO placeholder
- [ ] RBAC model defined (roles: Viewer/Operator/Admin/Security/Treasury)
- [ ] Session handling (refresh + expiry + device list)
- [ ] API key issuance/rotation/revocation UI
- [ ] Multi-sig approval workflow scaffold (admin actions require approval)
- [ ] Hardware wallet enforcement toggle (admin/validator actions)

**Acceptance checks**

- [ ] Role-based route guarding works
- [ ] Actions are denied server-side even if UI is bypassed

### Security Controls

- [ ] Validator key status dashboard (hot/warm/cold, last rotation)
- [ ] Slashing detection alerts
- [ ] Node firewall/port checks (basic scan status from agent)
- [ ] Vault/HSM health widget
- [ ] Rate limit & API abuse monitoring panel
- [ ] Permission audit trail (who did what, when, from where)

**Done when:** every privileged action writes an audit log entry and is RBAC gated.

---

## 🧱 Network & Chain Management

### Chain Overview

- [ ] Display Chain ID, name, env, consensus type
- [ ] Finality time + block time target vs actual
- [ ] Epoch/round tracking
- [ ] Fork / reorg detection indicator + event timeline
- [ ] Config viewer (read-only): genesis hash, params, upgrades

### Node Management

- [ ] Node inventory (Validator/Full/Archive/RPC)
- [ ] Health, uptime, peer count, sync status
- [ ] Resource metrics (CPU/RAM/Disk/IOPS)
- [ ] Snapshot & pruning controls (UI + API)
- [ ] Restart/upgrade orchestration (safe rolling restart)
- [ ] Version drift detection + “recommended version” banner

**Done when:** operators can identify unhealthy nodes in <30 seconds and take safe action.

---

## ⛓️ Validator & Consensus Management

### Validator Operations

- [ ] Validator list + filter (active/jailed/slashed)
- [ ] Stake + delegation view
- [ ] Commission config view + update flow (RBAC)
- [ ] Rewards accumulation + payout tracking
- [ ] Missed blocks panel + downtime histogram
- [ ] Voting power distribution chart

### Consensus Monitoring

- [ ] Block proposer rotation view
- [ ] Participation rate per validator
- [ ] BFT alerts (late votes, equivocation flags if available)
- [ ] Finality failures timeline
- [ ] Consensus latency heatmap

**Done when:** missed blocks, proposer rotation, and finality issues are visible and alertable.

---

## 💸 Token, Economics & Treasury

### Native Token Controls

- [ ] Total supply / circulating supply view
- [ ] Inflation/emission schedule module
- [ ] Burn/mint tracking
- [ ] Gas fee model configuration panel (guarded)
- [ ] Fee distribution rules display + change workflow

### Treasury Dashboard

- [ ] Treasury balances (per asset)
- [ ] Multisig approvals panel (proposals, signers, status)
- [ ] Spend proposals + history
- [ ] Revenue tracking (fees, bridge fees, protocol income)
- [ ] Validator reward payout overview

**Done when:** treasury actions require approvals + exportable audit logs.

---

## 📜 Smart Contracts & VM

### Contract Management

- [ ] Deployed contracts registry (name, address, chain, tags)
- [ ] ABI upload/management + source verification status
- [ ] Upgradeability detection (proxy admin, impl address)
- [ ] Contract ownership view + transfer flow
- [ ] Pause/emergency control panel (for supported contracts)

### Execution Analytics

- [ ] Gas usage per contract
- [ ] Call frequency + top callers
- [ ] Failure/revert rate tracking
- [ ] Exploit detection hooks (reentrancy patterns if supported)
- [ ] AI anomaly score column (placeholder supported)

**Done when:** every critical contract has metadata + upgrade path visibility.

---

## 🌉 Cross-Chain & Bridges

### Bridge Monitoring

- [ ] Supported chains list + status
- [ ] Bridge liquidity pools view
- [ ] Pending/finalized transfers tables
- [ ] Failed/disputed transactions view
- [ ] Validator signatures per transfer (where applicable)

### Interoperability Controls

- [ ] Bridge fee tuning
- [ ] Pause bridge / resume bridge
- [ ] Emergency withdrawal mode (if supported)
- [ ] Message queue depth + backlog alerts
- [ ] Fraud-proof monitoring (optimistic bridges)

**Done when:** bridge incidents can be detected + paused fast with audit trail.

---

## 📊 Transactions & Blocks

### Transaction Explorer

- [ ] Real-time mempool view (if available)
- [ ] Tx lifecycle view (pending → included → finalized)
- [ ] Sender/receiver analytics panel
- [ ] Gas optimization hints (estimator + recommended fee)
- [ ] Failed tx diagnostics (revert reason if available)

### Block Explorer

- [ ] Block timeline + proposer identity
- [ ] Inclusion fairness indicators
- [ ] MEV detection module placeholder
- [ ] Block size utilization chart

**Done when:** operators can debug a failed tx and see chain activity live.

---

## 🤖 AI, Analytics & Intelligence

### AI Security & Risk

- [ ] Fraud detection score ingestion + display
- [ ] Wallet behavior profiles (risk tags)
- [ ] Sybil detection surface (clusters, heuristics)
- [ ] Bot / wash trading detection widgets
- [ ] Contract risk scoring widget

### Predictive Analytics

- [ ] Congestion forecast chart
- [ ] Gas price prediction widget
- [ ] Validator downtime prediction
- [ ] Slashing risk forecast
- [ ] Capacity planning panel

**Done when:** models can be swapped in later (clean interfaces + data contracts).

---

## 📈 Monitoring, Logs & Alerts

### Observability

- [ ] Prometheus integration (metrics endpoint list + scrape status)
- [ ] Grafana embed panels (dashboards per chain)
- [ ] Custom KPIs editor (basic)
- [ ] SLA tracking page
- [ ] Latency percentiles (p50/p95/p99)

### Alerts & Notifications

- [ ] Notification channels: Email/Slack/Discord/Webhook
- [ ] Threshold alerts (CPU, disk, missed blocks, bridge queue)
- [ ] AI anomaly alerts (placeholder)
- [ ] Validator downtime alert
- [ ] Bridge incident alert

**Done when:** any major incident generates a notification + is visible in incident timeline.

---

## 🧪 DevOps & Upgrades

### Network Operations

- [ ] Hard fork scheduling panel (read-only first)
- [ ] Soft fork toggles / feature flags management
- [ ] Canary deployment flow
- [ ] Rollback mechanism support (documented + UI gates)

### CI/CD Hooks

- [ ] GitHub/GitLab integration placeholder
- [ ] Contract deployment pipeline integration
- [ ] Validator image upgrade workflows
- [ ] Version compatibility checks

**Done when:** upgrades are safe, auditable, and reversible.

---

## 🏛️ Governance & DAO

### On-Chain Governance

- [ ] Proposal creation
- [ ] Voting dashboard + quorum tracking
- [ ] Execution queue view
- [ ] Delegated voting panel

### Off-Chain Governance

- [ ] Snapshot integration (optional)
- [ ] Forum links
- [ ] Proposal analytics (participation trends)
- [ ] Participation heatmaps

**Done when:** governance lifecycle is visible end-to-end.

---

## 🌐 API, SDK & Integrations

### Developer Tools

- [ ] RPC endpoint manager (add/remove/test)
- [ ] Rate limit controls
- [ ] API usage analytics
- [ ] SDK version display + changelog
- [ ] Webhook configuration UI

### External Integrations

- [ ] Exchange integration stubs
- [ ] Oracle integration status
- [ ] Indexer integration status
- [ ] Analytics platform integrations
- [ ] KYC/compliance provider hooks

**Done when:** devs can self-serve endpoints/keys and see usage.

---

## 🧑‍💼 Admin & Platform Management

### System Settings

- [ ] Environment configs editor (guarded + validated)
- [ ] Feature toggles
- [ ] Maintenance mode
- [ ] Branding/theming
- [ ] Localization/i18n scaffold

### Audit & Compliance

- [ ] Action logs (filter, export)
- [ ] Validator action logs
- [ ] Treasury action logs
- [ ] Compliance reports generator stub
- [ ] Export logs CSV/JSON

**Done when:** all critical actions are traceable and exportable.

---

## 🧠 Optional Advanced Modules (Enterprise / L3)

- [ ] Rollup sequencer control panel
- [ ] Fraud proof visualization
- [ ] ZK proof status widget
- [ ] Data availability monitoring
- [ ] L2 ↔ L1 settlement tracking
- [ ] AI-controlled fee market module (guarded experiment)

---

# VS Code “Daily Dev Flow” Checklist

- [ ] Pull latest + run lint/tests
- [ ] Verify `.env` matches `.env.example`
- [ ] Run `dev` stack (web + api + indexer mocks)
- [ ] Confirm RBAC roles in seed data
- [ ] Check alerts pipeline in dev (send test alert)
- [ ] Confirm audit log entries for new endpoints
- [ ] Update changelog + add screenshots for new modules

---

If you want, I can also format this into:

- a **GitHub issue template** (checkboxes + acceptance criteria), or
- a **VS Code Tasks + TODO tree setup** (so these show up as tracked TODOs in the sidebar).
