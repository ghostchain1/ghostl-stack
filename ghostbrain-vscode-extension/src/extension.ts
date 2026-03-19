/**
 * GhostBrain VS Code Extension — src/extension.ts
 *
 * GhostChain-native AI copilot for GhostChain L1, GhostL2, GhostL3,
 * GhostBridge, validator operations, and multichain development workflows.
 *
 * Chain topology:
 *   L1  chain_id 14000101  RPC :18545  gas token GST
 *   L2  chain_id 901       RPC :7260
 *   L3  chain_id 903       RPC :7270
 *   GhostBrain Core        :7900
 *
 * Security: API key is stored exclusively in VS Code SecretStorage —
 * never written to settings.json or any plaintext file.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceContext = {
  name: string;
  folders: string[];
  activeFile?: string;
  languageId?: string;
};

type GhostBrainRequest = {
  prompt: string;
  model: string;
  stream?: boolean;
  workspace?: WorkspaceContext;
};

type GhostBrainResponse = {
  reply?: string;
  output?: string;
  message?: string;
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
};

type ChainHealthResult = {
  label: string;
  chainId: number;
  url: string;
  blockNumber?: string;
  peers?: string;
  latencyMs?: number;
  error?: string;
  ok: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SECRET_KEY = 'ghostbrain.apiKey';

const CHAIN_LAYERS = [
  { label: 'GhostChain L1', chainId: 14000101, configKey: 'l1RpcUrl', defaultUrl: 'http://localhost:18545' },
  { label: 'GhostL2',       chainId: 901,       configKey: 'l2RpcUrl', defaultUrl: 'http://localhost:7260' },
  { label: 'GhostL3',       chainId: 903,       configKey: 'l3RpcUrl', defaultUrl: 'http://localhost:7270' },
] as const;

// Bridge and validator file patterns to scan in the workspace
const BRIDGE_PATTERNS   = ['interchain-bridge', 'bridge', 'ghostbridge'];
const VALIDATOR_PATTERNS = ['validators', 'validator-ai', 'validator', 'ghostvalidator'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cfg<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration('ghostbrain').get<T>(key, fallback);
}

function getWorkspaceContext(): WorkspaceContext | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const editor  = vscode.window.activeTextEditor;
  if (folders.length === 0 && !editor) return undefined;
  return {
    name:       vscode.workspace.name ?? 'ghost-workspace',
    folders:    folders.map((f) => f.uri.fsPath),
    activeFile: editor?.document.uri.fsPath,
    languageId: editor?.document.languageId,
  };
}

/** Resolve API key: SecretStorage first, then legacy settings fallback. */
async function resolveApiKey(secrets: vscode.SecretStorage): Promise<string> {
  const stored = await secrets.get(SECRET_KEY);
  if (stored && stored.trim()) return stored.trim();
  // Legacy fallback — warn user to migrate
  const legacy = cfg<string>('apiKey', '');
  if (legacy) {
    void vscode.window.showWarningMessage(
      'GhostBrain: API key found in settings.json. Run "GhostBrain: Set API Key (Secure)" to migrate to SecretStorage.'
    );
  }
  return legacy;
}

/** JSON-RPC call to a chain node. */
async function rpcCall(
  url: string,
  method: string,
  params: unknown[] = []
): Promise<{ result?: string; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal:  controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = (await res.json()) as { result?: string; error?: { message?: string } };
    if (data.error) return { error: data.error.message ?? 'RPC error' };
    return { result: data.result ?? '' };
  } catch (err) {
    clearTimeout(timeout);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Scan workspace folders for files matching a set of path patterns. */
function scanWorkspaceFiles(patterns: string[], maxFiles = 20): string[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const found: string[] = [];

  for (const folder of folders) {
    const root = folder.uri.fsPath;
    for (const pattern of patterns) {
      const candidate = path.join(root, pattern);
      if (fs.existsSync(candidate)) {
        collectFiles(candidate, found, maxFiles);
        if (found.length >= maxFiles) break;
      }
    }
    if (found.length >= maxFiles) break;
  }
  return found;
}

function collectFiles(dir: string, acc: string[], max: number): void {
  if (acc.length >= max) return;
  try {
    const stat = fs.statSync(dir);
    if (stat.isFile()) {
      acc.push(dir);
      return;
    }
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (acc.length >= max) break;
        const full = path.join(dir, entry);
        collectFiles(full, acc, max);
      }
    }
  } catch {
    // skip unreadable paths
  }
}

/** Read up to `maxBytes` from a file, returning a truncated string. */
function readFileSafe(filePath: string, maxBytes = 4096): string {
  try {
    const buf = Buffer.alloc(maxBytes);
    const fd  = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    const content = buf.slice(0, bytesRead).toString('utf8');
    const size = fs.statSync(filePath).size;
    return size > maxBytes ? content + `\n... [truncated — ${size} bytes total]` : content;
  } catch {
    return '[unreadable]';
  }
}

// ─── GhostBrain API ───────────────────────────────────────────────────────────

/**
 * Send a prompt to GhostBrain and return the full response string.
 * Supports streaming (chunked SSE) when `ghostbrain.enableStreaming` is true.
 */
async function askGhostBrain(
  prompt: string,
  secrets: vscode.SecretStorage,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const apiBaseUrl  = cfg<string>('apiBaseUrl', 'http://localhost:7900');
  const model       = cfg<string>('defaultModel', 'ghostbrain-dev');
  const streaming   = cfg<boolean>('enableStreaming', true) && !!onChunk;
  const includeCtx  = cfg<boolean>('enableWorkspaceContext', true);
  const apiKey      = await resolveApiKey(secrets);

  const body: GhostBrainRequest = {
    prompt,
    model,
    stream:    streaming,
    workspace: includeCtx ? getWorkspaceContext() : undefined,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const url = `${apiBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;

  const response = await fetch(url, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GhostBrain API ${response.status}: ${text}`);
  }

  // ── Streaming path ──────────────────────────────────────────────────────────
  if (streaming && response.body) {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // SSE lines: "data: {...}\n\n"
      for (const line of chunk.split('\n')) {
        const trimmed = line.replace(/^data:\s*/, '').trim();
        if (!trimmed || trimmed === '[DONE]') continue;
        try {
          const parsed = JSON.parse(trimmed) as GhostBrainResponse;
          const delta  =
            parsed.choices?.[0]?.delta?.content ??
            parsed.choices?.[0]?.message?.content ??
            parsed.reply ??
            parsed.output ??
            parsed.message ??
            '';
          if (delta) {
            full += delta;
            onChunk?.(delta);
          }
        } catch {
          // non-JSON SSE line — skip
        }
      }
    }
    return full || 'GhostBrain returned an empty response.';
  }

  // ── Non-streaming path ──────────────────────────────────────────────────────
  const data = (await response.json()) as GhostBrainResponse;
  return (
    data.choices?.[0]?.message?.content ??
    data.reply ??
    data.output ??
    data.message ??
    'GhostBrain returned an empty response.'
  );
}

// ─── Chain Health ─────────────────────────────────────────────────────────────

async function checkChainHealth(): Promise<ChainHealthResult[]> {
  const results: ChainHealthResult[] = [];

  for (const layer of CHAIN_LAYERS) {
    const url = cfg<string>(layer.configKey, layer.defaultUrl);
    const t0  = Date.now();

    const [blockRes, peerRes] = await Promise.all([
      rpcCall(url, 'ghost_blockNumber'),
      rpcCall(url, 'net_peerCount'),
    ]);

    const latencyMs = Date.now() - t0;

    if (blockRes.error) {
      results.push({
        label:     layer.label,
        chainId:   layer.chainId,
        url,
        latencyMs,
        error:     blockRes.error,
        ok:        false,
      });
    } else {
      const blockHex = blockRes.result ?? '0x0';
      const peerHex  = peerRes.result  ?? '0x0';
      results.push({
        label:       layer.label,
        chainId:     layer.chainId,
        url,
        blockNumber: String(parseInt(blockHex, 16)),
        peers:       String(parseInt(peerHex, 16)),
        latencyMs,
        ok:          true,
      });
    }
  }

  return results;
}

function formatHealthTable(results: ChainHealthResult[]): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║              GhostBrain — Chain Health Report                ║',
    '╠══════════════════════════════════════════════════════════════╣',
  ];

  for (const r of results) {
    const status = r.ok ? '✅ ONLINE' : '❌ OFFLINE';
    lines.push(`║  ${r.label.padEnd(18)} chain_id ${String(r.chainId).padEnd(10)} ${status.padEnd(12)} ║`);
    if (r.ok) {
      lines.push(`║    Block: ${String(r.blockNumber).padEnd(12)} Peers: ${String(r.peers).padEnd(6)} Latency: ${r.latencyMs}ms`.padEnd(63) + '║');
    } else {
      lines.push(`║    Error: ${r.error ?? 'unknown'}`.padEnd(63) + '║');
    }
    lines.push('║                                                              ║');
  }

  lines.push('╚══════════════════════════════════════════════════════════════╝');
  return lines.join('\n');
}

// ─── Webview Provider ─────────────────────────────────────────────────────────

class GhostBrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ghostbrain.chat';
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel,
    private readonly secrets: vscode.SecretStorage
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; prompt?: string }) => {
      if (message.type === 'ghostbrain.ask' && message.prompt) {
        try {
          // Start streaming — send chunks as they arrive
          let accumulated = '';
          void webviewView.webview.postMessage({ type: 'ghostbrain.stream.start' });

          const result = await askGhostBrain(
            message.prompt,
            this.secrets,
            (chunk) => {
              accumulated += chunk;
              void webviewView.webview.postMessage({ type: 'ghostbrain.stream.chunk', chunk });
            }
          );

          void webviewView.webview.postMessage({
            type:   'ghostbrain.stream.end',
            answer: result || accumulated,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          void webviewView.webview.postMessage({ type: 'ghostbrain.error', message: msg });
        }
      }
    });
  }

  public async revealAndAsk(prompt: string): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.ghostbrain');
    this.view?.show?.(true);
    this.view?.webview.postMessage({ type: 'ghostbrain.prefill', prompt });
  }

  public postHealthResult(table: string): void {
    this.view?.webview.postMessage({ type: 'ghostbrain.health', table });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>GhostBrain</title>
  <style>
    :root {
      --bg:       #07110d;
      --panel:    #0d1813;
      --border:   #173327;
      --text:     #d5f7e6;
      --muted:    #8ab89a;
      --accent:   #3cff8f;
      --accent2:  #2bd174;
      --danger:   #ff7f7f;
      --warn:     #ffd97f;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      padding: 14px;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family, monospace);
      font-size: 13px;
    }

    /* ── Brand header ── */
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      margin-bottom: 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(160deg, rgba(60,255,143,0.09), rgba(60,255,143,0.02));
    }
    .brand-icon {
      width: 28px; height: 28px;
      background: var(--accent2);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
    }
    .brand-text h1 { font-size: 15px; font-weight: 700; color: var(--accent); }
    .brand-text p  { font-size: 11px; color: var(--muted); margin-top: 2px; }

    /* ── Quick actions ── */
    .quick-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 12px;
    }
    .qa-btn {
      padding: 7px 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      font-size: 11px;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, color 0.15s;
    }
    .qa-btn:hover { border-color: var(--accent2); color: var(--accent); }
    .qa-btn .qa-icon { margin-right: 4px; }

    /* ── Input area ── */
    textarea {
      width: 100%;
      min-height: 100px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      padding: 10px;
      outline: none;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.5;
    }
    textarea:focus { border-color: var(--accent2); }

    .send-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    button.send {
      flex: 1;
      border: 0;
      border-radius: 10px;
      padding: 10px;
      background: var(--accent);
      color: #04110a;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button.send:hover    { background: var(--accent2); }
    button.send:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; }
    button.clear {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
    }
    button.clear:hover { border-color: var(--danger); color: var(--danger); }

    /* ── Output ── */
    .output-wrap {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel);
      overflow: hidden;
    }
    .output-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      color: var(--muted);
    }
    .output-header .dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--border);
      display: inline-block;
      margin-right: 6px;
    }
    .output-header .dot.active { background: var(--accent); animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    pre#output {
      white-space: pre-wrap;
      word-break: break-word;
      padding: 12px;
      color: var(--text);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      line-height: 1.6;
      max-height: 420px;
      overflow-y: auto;
    }
    pre#output.error { color: var(--danger); }
    pre#output.health { color: var(--accent); }

    .hint { color: var(--muted); font-size: 11px; margin-top: 8px; text-align: center; }
  </style>
</head>
<body>

  <div class="brand">
    <div class="brand-icon">👻</div>
    <div class="brand-text">
      <h1>GhostBrain</h1>
      <p>GhostChain AI console · L1 · L2 · L3 · Bridge · Validators</p>
    </div>
  </div>

  <div class="quick-actions">
    <button class="qa-btn" data-prompt="Check the health of GhostChain L1, GhostL2, and GhostL3 nodes and summarize any issues.">
      <span class="qa-icon">🔗</span>Chain Health
    </button>
    <button class="qa-btn" data-prompt="Analyze the interchain bridge configuration in this workspace and identify risks or misconfigurations.">
      <span class="qa-icon">🌉</span>Bridge Config
    </button>
    <button class="qa-btn" data-prompt="Review the validator setup in this workspace and surface any security or performance concerns.">
      <span class="qa-icon">🛡️</span>Validator Setup
    </button>
    <button class="qa-btn" data-prompt="Analyze this GhostChain workspace and recommend the highest-value next implementation step.">
      <span class="qa-icon">🔍</span>Workspace Analysis
    </button>
  </div>

  <textarea id="prompt"
    placeholder="Ask GhostBrain about GhostChain L1/L2/L3, bridge logic, validators, contracts, governance, or workspace code..."></textarea>

  <div class="send-row">
    <button class="send" id="send">Send to GhostBrain ⚡</button>
    <button class="clear" id="clear" title="Clear output">✕</button>
  </div>

  <div class="hint">Workspace-aware · Streams through your configured GhostBrain endpoint</div>

  <div class="output-wrap">
    <div class="output-header">
      <span><span class="dot" id="dot"></span>GhostBrain Output</span>
      <span id="status-label">Ready</span>
    </div>
    <pre id="output">Ready.</pre>
  </div>

  <script nonce="${nonce}">
    const vscode      = acquireVsCodeApi();
    const promptEl    = document.getElementById('prompt');
    const outputEl    = document.getElementById('output');
    const sendEl      = document.getElementById('send');
    const clearEl     = document.getElementById('clear');
    const dotEl       = document.getElementById('dot');
    const statusLabel = document.getElementById('status-label');

    let streaming = false;

    function setStreaming(active) {
      streaming = active;
      sendEl.disabled = active;
      dotEl.className = active ? 'dot active' : 'dot';
      statusLabel.textContent = active ? 'Streaming…' : 'Ready';
    }

    sendEl.addEventListener('click', () => {
      const prompt = promptEl.value.trim();
      if (!prompt) { outputEl.textContent = 'Enter a prompt first.'; return; }
      outputEl.textContent = '';
      outputEl.className = '';
      setStreaming(true);
      vscode.postMessage({ type: 'ghostbrain.ask', prompt });
    });

    clearEl.addEventListener('click', () => {
      outputEl.textContent = 'Ready.';
      outputEl.className = '';
      setStreaming(false);
    });

    // Quick-action buttons
    document.querySelectorAll('.qa-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        promptEl.value = btn.getAttribute('data-prompt') || '';
        promptEl.focus();
      });
    });

    // Ctrl+Enter to send
    promptEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendEl.click();
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;

      if (msg.type === 'ghostbrain.stream.start') {
        outputEl.textContent = '';
        outputEl.className = '';
        setStreaming(true);
      }

      if (msg.type === 'ghostbrain.stream.chunk') {
        outputEl.textContent += msg.chunk;
        outputEl.scrollTop = outputEl.scrollHeight;
      }

      if (msg.type === 'ghostbrain.stream.end') {
        if (msg.answer && !outputEl.textContent.trim()) {
          outputEl.textContent = msg.answer;
        }
        setStreaming(false);
      }

      if (msg.type === 'ghostbrain.error') {
        outputEl.textContent = '⚠ ' + msg.message;
        outputEl.className = 'error';
        setStreaming(false);
      }

      if (msg.type === 'ghostbrain.prefill') {
        promptEl.value = msg.prompt;
        promptEl.focus();
      }

      if (msg.type === 'ghostbrain.health') {
        outputEl.textContent = msg.table;
        outputEl.className = 'health';
        setStreaming(false);
      }
    });
  </script>
</body>
</html>`;
  }
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  const output   = vscode.window.createOutputChannel('GhostBrain');
  const secrets  = context.secrets;
  const provider = new GhostBrainViewProvider(context.extensionUri, output, secrets);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text    = '$(hubot) GhostBrain';
  statusBar.tooltip = 'Open GhostBrain Console';
  statusBar.command = 'ghostbrain.openPanel';
  statusBar.show();

  // ── Register webview provider ──────────────────────────────────────────────
  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerWebviewViewProvider(GhostBrainViewProvider.viewType, provider),

    // ── ghostbrain.setApiKey ─────────────────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title:       'GhostBrain: Set API Key',
        prompt:      'Enter your GhostBrain API key. It will be stored in VS Code SecretStorage (encrypted).',
        password:    true,
        placeHolder: 'gb-sk-...',
        ignoreFocusOut: true,
      });
      if (key === undefined) return; // cancelled
      if (!key.trim()) {
        await secrets.delete(SECRET_KEY);
        void vscode.window.showInformationMessage('GhostBrain: API key cleared from SecretStorage.');
        return;
      }
      await secrets.store(SECRET_KEY, key.trim());
      void vscode.window.showInformationMessage('GhostBrain: API key saved to SecretStorage ✓');
    }),

    // ── ghostbrain.openPanel ─────────────────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.openPanel', async () => {
      await provider.revealAndAsk(
        'Review the current GhostChain workspace and suggest the highest-value next implementation step.'
      );
    }),

    // ── ghostbrain.askSelection ──────────────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.askSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('GhostBrain: Open a file and select code first.');
        return;
      }
      const selection = editor.document.getText(editor.selection).trim();
      if (!selection) {
        void vscode.window.showWarningMessage('GhostBrain: Select code or text first.');
        return;
      }
      await provider.revealAndAsk(
        `Analyze this selection from ${path.basename(editor.document.uri.fsPath)} ` +
        `(${editor.document.languageId}) and explain its purpose, risks, and improvements:\n\n${selection}`
      );
    }),

    // ── ghostbrain.analyzeWorkspace ──────────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.analyzeWorkspace', async () => {
      const workspace = getWorkspaceContext();
      const summary   = workspace ? JSON.stringify(workspace, null, 2) : 'No workspace context found.';

      try {
        output.show(true);
        output.appendLine('[GhostBrain] Analyzing workspace...');
        const result = await askGhostBrain(
          `Analyze this GhostChain workspace context and recommend architecture, security, and next implementation steps:\n\n${summary}`,
          secrets
        );
        output.appendLine(result);
        await provider.revealAndAsk(
          `Summarize this workspace analysis in actionable steps:\n\n${result}`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output.appendLine(`[GhostBrain] Error: ${message}`);
        void vscode.window.showErrorMessage(`GhostBrain analyze failed: ${message}`);
      }
    }),

    // ── ghostbrain.checkChainHealth ──────────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.checkChainHealth', async () => {
      const statusMsg = vscode.window.setStatusBarMessage('$(sync~spin) GhostBrain: Checking chain health…');
      try {
        output.show(true);
        output.appendLine('[GhostBrain] Checking L1/L2/L3 health…');

        const results = await checkChainHealth();
        const table   = formatHealthTable(results);

        output.appendLine(table);

        // Show in sidebar
        await vscode.commands.executeCommand('workbench.view.extension.ghostbrain');
        provider.postHealthResult(table);

        // Also ask GhostBrain to interpret the results
        const onlineCount  = results.filter((r) => r.ok).length;
        const offlineCount = results.filter((r) => !r.ok).length;

        if (offlineCount > 0) {
          void vscode.window.showWarningMessage(
            `GhostBrain: ${offlineCount} chain layer(s) offline. Check the GhostBrain console for details.`
          );
        } else {
          void vscode.window.showInformationMessage(
            `GhostBrain: All ${onlineCount} chain layers online ✓`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        output.appendLine(`[GhostBrain] Health check error: ${message}`);
        void vscode.window.showErrorMessage(`GhostBrain health check failed: ${message}`);
      } finally {
        statusMsg.dispose();
      }
    }),

    // ── ghostbrain.analyzeBridgeConfig ───────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.analyzeBridgeConfig', async () => {
      const statusMsg = vscode.window.setStatusBarMessage('$(sync~spin) GhostBrain: Scanning bridge config…');
      try {
        const files = scanWorkspaceFiles(BRIDGE_PATTERNS, 15);

        if (files.length === 0) {
          void vscode.window.showWarningMessage(
            'GhostBrain: No bridge config files found. Make sure your workspace contains interchain-bridge/ or bridge* files.'
          );
          statusMsg.dispose();
          return;
        }

        output.show(true);
        output.appendLine(`[GhostBrain] Found ${files.length} bridge file(s). Sending to GhostBrain…`);

        const fileContents = files
          .map((f) => `### ${path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', f)}\n\`\`\`\n${readFileSafe(f)}\n\`\`\``)
          .join('\n\n');

        const prompt =
          `You are a GhostChain bridge security auditor. Analyze the following interchain bridge ` +
          `configuration files from the GhostChain stack (L1 chain_id 14000101, L2 chain_id 901, ` +
          `L3 chain_id 903). Identify misconfigurations, security risks, missing validations, ` +
          `and recommend fixes:\n\n${fileContents}`;

        await provider.revealAndAsk(prompt);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`GhostBrain bridge analysis failed: ${message}`);
      } finally {
        statusMsg.dispose();
      }
    }),

    // ── ghostbrain.reviewValidatorSetup ──────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.reviewValidatorSetup', async () => {
      const statusMsg = vscode.window.setStatusBarMessage('$(sync~spin) GhostBrain: Scanning validator setup…');
      try {
        const files = scanWorkspaceFiles(VALIDATOR_PATTERNS, 15);

        if (files.length === 0) {
          void vscode.window.showWarningMessage(
            'GhostBrain: No validator config files found. Make sure your workspace contains validators/ or validator* files.'
          );
          statusMsg.dispose();
          return;
        }

        output.show(true);
        output.appendLine(`[GhostBrain] Found ${files.length} validator file(s). Sending to GhostBrain…`);

        const fileContents = files
          .map((f) => `### ${path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', f)}\n\`\`\`\n${readFileSafe(f)}\n\`\`\``)
          .join('\n\n');

        const prompt =
          `You are a GhostChain validator operations expert. Review the following validator ` +
          `configuration and setup files from the GhostChain stack. Identify security risks, ` +
          `jailing risks, stake-weight anomalies, missing redundancy, and recommend hardening steps. ` +
          `Chain: GhostChain L1 (chain_id 14000101), gas token GST:\n\n${fileContents}`;

        await provider.revealAndAsk(prompt);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`GhostBrain validator review failed: ${message}`);
      } finally {
        statusMsg.dispose();
      }
    }),

    // ── ghostbrain.explainContract ───────────────────────────────────────────
    vscode.commands.registerCommand('ghostbrain.explainContract', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showWarningMessage('GhostBrain: Open a contract file and select code first.');
        return;
      }

      const selection = editor.document.getText(editor.selection).trim();
      if (!selection) {
        void vscode.window.showWarningMessage('GhostBrain: Select contract code first.');
        return;
      }

      const fileName = path.basename(editor.document.uri.fsPath);
      const langId   = editor.document.languageId;

      const prompt =
        `You are a GhostChain smart contract auditor. Explain the following ${langId} contract ` +
        `code from ${fileName} in the GhostChain stack (L1 chain_id 14000101, gas token GST). ` +
        `Cover: purpose, state mutations, access control, reentrancy risks, gas efficiency, ` +
        `and any GhostChain-specific integration points:\n\n\`\`\`${langId}\n${selection}\n\`\`\``;

      await provider.revealAndAsk(prompt);
    })
  );
}

export function deactivate(): void {
  // no-op — VS Code disposes all subscriptions automatically
}
