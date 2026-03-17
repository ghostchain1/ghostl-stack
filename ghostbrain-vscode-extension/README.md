# GhostBrain VS Code Extension

GhostBrain brings GhostChain-native AI workflows directly into VS Code for building, operating, and auditing:

- **GhostChain L1** (chain_id `14000101`, gas token `GST`)
- **GhostL2** (chain_id `901`)
- **GhostL3** (chain_id `903`)
- **GhostBridge** interchain bridge
- **GhostBrain** orchestration core
- Multichain dev, testnet, and mainnet promotion flows

---

## Features

### Core Commands

| Command | Shortcut | Description |
|---|---|---|
| `GhostBrain: Open Console` | — | Open the GhostBrain sidebar chat panel |
| `GhostBrain: Ask About Selection` | `Ctrl+Shift+G` | Send selected code to GhostBrain for analysis |
| `GhostBrain: Analyze Workspace` | — | Full workspace-aware architecture review |

### GhostChain-Native Commands

| Command | Shortcut | Description |
|---|---|---|
| `GhostBrain: Check L1/L2/L3 Health` | `Ctrl+Shift+H` | Live RPC health check across all three chain layers |
| `GhostBrain: Analyze Bridge Config` | — | Scan and analyze interchain bridge configuration files |
| `GhostBrain: Review Validator Setup` | — | Audit validator configuration and surface risks |
| `GhostBrain: Explain Selected Contract` | — | Deep-explain selected Solidity/Vyper/Go contract code |
| `GhostBrain: Set API Key (Secure)` | — | Store your GhostBrain API key in VS Code SecretStorage |

### Sidebar Console

- Workspace-aware prompts routed through your configured GhostBrain endpoint
- Streaming token-by-token responses
- GhostChain dark-branded UI

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `ghostbrain.apiBaseUrl` | `http://localhost:7900` | GhostBrain Core service URL |
| `ghostbrain.defaultModel` | `ghostbrain-dev` | Model/agent identifier |
| `ghostbrain.enableWorkspaceContext` | `true` | Include workspace metadata in prompts |
| `ghostbrain.l1RpcUrl` | `http://localhost:18545` | GhostChain L1 JSON-RPC |
| `ghostbrain.l2RpcUrl` | `http://localhost:29545` | GhostL2 JSON-RPC |
| `ghostbrain.l3RpcUrl` | `http://localhost:39545` | GhostL3 JSON-RPC |
| `ghostbrain.enableStreaming` | `true` | Stream responses in the sidebar |

> **Security:** The API key is stored in VS Code's encrypted `SecretStorage` — never in `settings.json`. Run `GhostBrain: Set API Key (Secure)` to configure it.

---

## Development

```bash
cd ghostbrain-vscode-extension
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

---

## Packaging

```bash
npm install -g @vscode/vsce
vsce package
```

This produces a `.vsix` file you can install locally:

```bash
code --install-extension ghostbrain-0.2.0.vsix
```

---

## Architecture

```
GhostBrain VS Code Extension
│
├── Sidebar WebviewView (ghostbrain.chat)
│   ├── Streaming chat panel
│   └── GhostChain dark-branded UI
│
├── Commands
│   ├── openPanel          → reveal sidebar + prefill prompt
│   ├── askSelection       → send selected code to GhostBrain
│   ├── analyzeWorkspace   → full workspace context analysis
│   ├── checkChainHealth   → JSON-RPC eth_blockNumber + net_peerCount
│   │                         L1 :18545 · L2 :29545 · L3 :39545
│   ├── analyzeBridgeConfig → scan interchain-bridge/ files → GhostBrain
│   ├── reviewValidatorSetup → scan validators/ files → GhostBrain
│   ├── explainContract    → selected .sol/.ts/.go/.rs/.vy → GhostBrain
│   └── setApiKey          → context.secrets.store()
│
├── SecretStorage
│   └── ghostbrain.apiKey  (encrypted, never in settings.json)
│
└── Status Bar
    └── $(hubot) GhostBrain  →  opens console
```

---

## Notes

- Add `media/ghostbrain.svg` before packaging so the activity bar icon resolves.
- If your Ghost AI SDK uses a different route than `/v1/chat/completions`, update the `fetch()` URL in `src/extension.ts`.
- For production: enable streaming, telemetry controls, and command-level access to GhostChain orchestration actions.
- Chain routing law: advisory signals only — GhostBrain ratifies any action via governance.
