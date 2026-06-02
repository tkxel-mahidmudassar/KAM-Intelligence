"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Sparkles, ChevronDown, Loader2, RotateCcw, Building2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRole } from "@/context/RoleContext";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  latencyMs?: number;
  model?: string;
  isError?: boolean;
}

interface Account {
  id: string;
  name: string;
  health: string;
  arr: number;
}

// ─── Suggested Prompts ────────────────────────────────────────────────────────

const PORTFOLIO_PROMPTS = [
  "Which accounts are at highest risk of churning in the next 90 days?",
  "Summarise the portfolio health across all accounts.",
  "Which KAM has the highest at-risk ARR right now?",
  "What are the top 3 actions I should take this week?",
];

const ACCOUNT_PROMPTS: Record<string, string[]> = {
  "acc-helix-001": [
    "What's driving the low health score for Helix Payments?",
    "Draft an exec escalation email for Jordan Walsh (CTO).",
    "What renewal strategy would you recommend given the 55-day window?",
    "Summarise the open signals and recommended next actions.",
  ],
  default: [
    "Summarise this account's current health.",
    "What are the most urgent actions for this account?",
    "What risks could affect renewal?",
    "Draft a brief account status update for my manager.",
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000)     return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

const HEALTH_COLOR: Record<string, string> = {
  HEALTHY: "#22C55E", AT_RISK: "#F59E0B", CRITICAL: "#EF4444",
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full mt-0.5",
        isUser ? "bg-[#0755E9]" : "bg-[#059669]/15 border border-[#059669]/30"
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-white" />
          : <Bot className="h-3.5 w-3.5 text-[#059669]" />}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
          isUser
            ? "bg-[#0755E9] text-white rounded-tr-sm"
            : msg.isError
            ? "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 rounded-tl-sm"
            : "bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-tl-sm"
        )}>
          {isUser || msg.isError ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em:     ({ children }) => <em className="italic">{children}</em>,
                ul:     ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 last:mb-0">{children}</ul>,
                ol:     ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 last:mb-0">{children}</ol>,
                li:     ({ children }) => <li className="text-[13px]">{children}</li>,
                h1:     ({ children }) => <h1 className="text-[15px] font-bold mb-2 mt-1">{children}</h1>,
                h2:     ({ children }) => <h2 className="text-[14px] font-bold mb-1.5 mt-1">{children}</h2>,
                h3:     ({ children }) => <h3 className="text-[13px] font-semibold mb-1 mt-1">{children}</h3>,
                code:   ({ children }) => <code className="font-mono text-[12px] bg-black/10 rounded px-1">{children}</code>,
                hr:     () => <hr className="border-[var(--border-subtle)] my-2" />,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
        {!isUser && msg.model && (
          <p className="text-[10px] text-[var(--text-disabled)] px-1 flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5" />
            {msg.model}
            {msg.latencyMs && ` · ${msg.latencyMs}ms`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#059669]/15 border border-[#059669]/30 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-[#059669]" />
      </div>
      <div className="bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--text-disabled)] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const { role } = useRole();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("__portfolio__");
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Load accounts for context selector
  useEffect(() => {
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setAccounts(res.data ?? []))
      .catch(() => {});
  }, [role]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;
  const prompts = selectedAccountId !== "__portfolio__"
    ? (ACCOUNT_PROMPTS[selectedAccountId] ?? ACCOUNT_PROMPTS.default)
    : PORTFOLIO_PROMPTS;

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res  = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({
          messages: history,
          accountId: selectedAccountId === "__portfolio__" ? undefined : selectedAccountId,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Request failed");

      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: json.data.content,
        latencyMs: json.data.latencyMs,
        model: json.data.model,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: e instanceof Error ? e.message : "Something went wrong. Please try again.",
        isError: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-112px)] max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">
            KAM Assistant
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            AI-powered co-pilot with live account context
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-lg hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Clear chat
          </button>
        )}
      </div>

      {/* Context selector */}
      <div className="relative mb-3 shrink-0">
        <button
          onClick={() => setShowAccountPicker((v) => !v)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium border transition-all",
            selectedAccountId === "__portfolio__"
              ? "bg-[#0755E9]/8 border-[#0755E9]/25 text-[#0755E9]"
              : "bg-[var(--bg-surface-2)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
          )}
        >
          {selectedAccountId === "__portfolio__" ? (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>Portfolio context</span>
            </>
          ) : (
            <>
              <Building2 className="h-3.5 w-3.5" />
              <span>{selectedAccount?.name}</span>
              {selectedAccount && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: HEALTH_COLOR[selectedAccount.health] ?? "#6B7280" }}
                />
              )}
            </>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 ml-1 transition-transform", showAccountPicker && "rotate-180")} />
        </button>

        {showAccountPicker && (
          <div className="absolute top-full mt-1 left-0 z-50 min-w-[260px] rounded-xl border border-[var(--glass-border)] bg-[var(--glass-elevated-bg)] [backdrop-filter:var(--glass-blur)] shadow-lg overflow-hidden">
            <button
              onClick={() => { setSelectedAccountId("__portfolio__"); setShowAccountPicker(false); clearChat(); }}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2.5 text-[12px] hover:bg-[var(--bg-surface-2)] transition-colors text-left",
                selectedAccountId === "__portfolio__" && "bg-[#0755E9]/8 text-[#0755E9]"
              )}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Portfolio context</span>
              <span className="ml-auto text-[10px] text-[var(--text-disabled)]">All accounts</span>
            </button>
            <div className="h-px bg-[var(--border-subtle)]" />
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => { setSelectedAccountId(a.id); setShowAccountPicker(false); clearChat(); }}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2.5 text-[12px] hover:bg-[var(--bg-surface-2)] transition-colors text-left",
                  selectedAccountId === a.id && "bg-[#0755E9]/8"
                )}
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: HEALTH_COLOR[a.health] ?? "#6B7280" }} />
                <span className="font-medium text-[var(--text-primary)] flex-1 truncate">{a.name}</span>
                <span className="text-[10px] text-[var(--text-disabled)] shrink-0">{formatARR(a.arr)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 space-y-4 min-h-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-[#059669]/12 border border-[#059669]/20 flex items-center justify-center mb-4">
              <Bot className="h-7 w-7 text-[#059669]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              How can I help?
            </h3>
            <p className="text-[12px] text-[var(--text-muted)] mb-6 max-w-sm">
              {selectedAccountId === "__portfolio__"
                ? "Ask me anything about your portfolio — risks, opportunities, actions, or account summaries."
                : `Ask me about ${selectedAccount?.name ?? "this account"} — health, risks, renewal strategy, or next best actions.`}
            </p>
            {/* Suggested prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {prompts.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-left px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-surface)] transition-all leading-snug"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts strip (when chat has messages) */}
      {!isEmpty && !loading && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1 shrink-0">
          {prompts.slice(0, 3).map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all whitespace-nowrap"
            >
              {p.length > 50 ? p.slice(0, 48) + "…" : p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="mt-2 shrink-0">
        <div className={cn(
          "flex items-end gap-2 rounded-xl border p-2 transition-all",
          "bg-[var(--bg-surface)] border-[var(--border-subtle)]",
          "focus-within:border-[#0755E9] focus-within:ring-1 focus-within:ring-[#0755E9]/20"
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={loading ? "Thinking…" : "Ask anything… (Enter to send, Shift+Enter for newline)"}
            disabled={loading}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-[13px] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-disabled)] outline-none",
              "max-h-[120px] overflow-y-auto py-1.5 px-2 leading-relaxed"
            )}
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
              input.trim() && !loading
                ? "bg-[#0755E9] text-white hover:bg-[#0647C7]"
                : "bg-[var(--border-subtle)] text-[var(--text-disabled)] cursor-not-allowed"
            )}
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-disabled)] mt-1 px-1">
          AI responses are grounded in live account data. Always verify before acting.
        </p>
      </div>
    </div>
  );
}
