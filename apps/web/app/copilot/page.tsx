"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CopilotResponse {
  input?:      string;
  normalized?: string;
  intent?:     string;
  confidence?: string;
  entities?:   Record<string, unknown>;
  task?:       Record<string, unknown>;
  safety?:     { ok: boolean; reason?: string; requiresConfirmation?: boolean };
  result?:     { ok: boolean; commandId?: string; answer?: string; error?: string; queued?: boolean; data?: unknown };
  timestamp?:  number;
  error?:      string;
  ok?:         boolean;
}

interface Message {
  id:        number;
  role:      "user" | "ai";
  text:      string;
  detail?:   CopilotResponse;
  loading?:  boolean;
}

// Minimal typings for Web Speech API (not in standard TS lib)
interface SpeechRecognitionResult { transcript: string; }
interface SpeechRecognitionResultList { 0?: { 0?: SpeechRecognitionResult } }
interface SpeechRecognitionEvent { results: SpeechRecognitionResultList; }
interface SpeechRecognitionInstance extends EventTarget {
  continuous:    boolean;
  interimResults: boolean;
  lang:          string;
  onresult:      ((e: SpeechRecognitionEvent) => void) | null;
  onerror:       (() => void) | null;
  onend:         (() => void) | null;
  start():       void;
  stop():        void;
}
interface SpeechRecognitionCtor { new(): SpeechRecognitionInstance; }

// ── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "deploy validator in asia",
  "how many validators are active?",
  "scan network security",
  "what is the treasury balance?",
  "optimize gas fees",
  "show system health",
  "restart rpc nodes",
  "run compliance audit",
  "evolve agents",
  "sync governance",
  "rebalance liquidity",
  "how many tasks are queued?",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function intentLabel(intent?: string): string {
  if (!intent) return "";
  return intent.replace(/_/g, " ");
}

function buildAnswer(res: CopilotResponse): string {
  if (!res.result?.ok) {
    const reason = res.result?.error ?? res.safety?.reason ?? res.error ?? "An error occurred.";
    if (res.safety?.requiresConfirmation) {
      return `⚠️ Confirmation required: ${reason}`;
    }
    return `❌ ${reason}`;
  }
  if (res.result.answer) return `✅ ${res.result.answer}`;
  if (res.result.commandId) return `✅ Command queued. ID: ${res.result.commandId}`;
  if (res.result.queued)    return `✅ Command accepted and queued for execution.`;
  return `✅ Command processed.`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CopilotPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [listening, setListening] = useState(false);
  const [openDetail, setOpenDetail] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const msgIdRef       = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialise Web Speech API
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as SpeechRecognitionCtor | undefined;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous    = false;
    rec.interimResults = false;
    rec.lang          = "en-US";
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setInput(transcript);
      setListening(false);
    };
    rec.onerror  = () => setListening(false);
    rec.onend    = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const submit = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);

    const userMsgId = ++msgIdRef.current;
    const aiMsgId   = ++msgIdRef.current;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: trimmed },
      { id: aiMsgId,   role: "ai",   text: "",       loading: true },
    ]);

    try {
      const res = await fetch("/api/copilot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ command: trimmed }),
      });
      const data: CopilotResponse = await res.json() as CopilotResponse;
      const answer = buildAnswer(data);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, text: answer, detail: data, loading: false }
            : m
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? { ...m, text: `❌ ${msg}`, loading: false }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading]);

  // ── Voice toggle ────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      rec.start();
      setListening(true);
    }
  }, [listening]);

  // ── Keyboard submit ─────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="copilot-wrap">

      {/* Suggestion chips */}
      <div className="copilot-suggestions">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="suggestion-chip"
            onClick={() => {
              setInput(s);
              inputRef.current?.focus();
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Message history */}
      <div className="copilot-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "3rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🤖</div>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>GhostStack AI Copilot</div>
            <div style={{ fontSize: "0.85rem" }}>
              Control your entire GhostBrain infrastructure with natural language. <br />
              Try a suggestion above or type a command below.
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row ${msg.role === "user" ? "msg-row-user" : ""}`}>
            {msg.role === "ai" && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", flexShrink: 0 }}>
                🤖
              </div>
            )}

            <div className={`msg-bubble ${msg.role === "user" ? "msg-bubble-user" : "msg-bubble-ai"}`}>
              {msg.loading ? (
                <div className="copilot-thinking">
                  <span /><span /><span />
                </div>
              ) : (
                <>
                  {msg.role === "ai" && msg.detail?.intent && (
                    <div className="msg-intent">{intentLabel(msg.detail.intent)}</div>
                  )}
                  <div>{msg.text}</div>

                  {msg.role === "ai" && msg.detail && (
                    <div
                      className="msg-detail"
                      onClick={() => setOpenDetail(openDetail === msg.id ? null : msg.id)}
                      title="Click to expand/collapse details"
                    >
                      {openDetail === msg.id
                        ? JSON.stringify(msg.detail, null, 2)
                        : `{ intent: "${msg.detail.intent}", confidence: "${msg.detail.confidence}" }  ← tap for details`}
                    </div>
                  )}
                </>
              )}
            </div>

            {msg.role === "user" && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", flexShrink: 0 }}>
                👤
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="copilot-input-bar">
        <input
          ref={inputRef}
          className="copilot-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command or ask a question…"
          disabled={loading}
          aria-label="Copilot command input"
        />
        <button
          className={`copilot-mic${listening ? " listening" : ""}`}
          onClick={toggleMic}
          title={listening ? "Stop listening" : "Voice input"}
          aria-label={listening ? "Stop voice input" : "Start voice input"}
          disabled={!recognitionRef.current}
        >
          🎙
        </button>
        <button
          className="copilot-send"
          onClick={() => void submit(input)}
          disabled={loading || !input.trim()}
        >
          {loading ? "…" : "Execute"}
        </button>
      </div>
    </div>
  );
}
