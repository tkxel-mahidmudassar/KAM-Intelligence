"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Send, Bot, User, Sparkles, ChevronDown, Loader2,
  RotateCcw, Building2, X, Maximize2, Minimize2,
} from "lucide-react";
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

// ─── Prompts ──────────────────────────────────────────────────────────────────

const PORTFOLIO_PROMPTS = [
  "Which accounts are at highest risk of churning?",
  "Summarise portfolio health.",
  "Top 3 actions I should take this week?",
  "What's our total at-risk ARR?",
];

const ACCOUNT_PROMPTS: Record<string, string[]> = {
  "acc-helix-001": [
    "What's driving the low health score?",
    "Summarise open signals and next actions.",
    "What renewal strategy do you recommend?",
    "Draft a brief exec escalation summary.",
  ],
  default: [
    "Summarise this account's current health.",
    "What are the most urgent actions?",
    "What risks could affect renewal?",
    "Draft a brief status update.",
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

// ─── Markdown Message ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5",
        isUser
          ? "bg-[#0755E9]"
          : "bg-[#059669]/15 border border-[#059669]/30"
      )}>
        {isUser
          ? <User className="h-3 w-3 text-white" />
          : <Bot className="h-3 w-3 text-[#059669]" />}
      </div>

      <div className={cn("max-w-[80%] space-y-1", isUser ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-2xl px-3 py-2 text-[12px] leading-relaxed",
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
                p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em:     ({ children }) => <em className="italic">{children}</em>,
                ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-1.5 last:mb-0">{children}</ul>,
                ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-1.5 last:mb-0">{children}</ol>,
                li:     ({ children }) => <li className="text-[12px]">{children}</li>,
                h1:     ({ children }) => <h1 className="text-[14px] font-bold mb-1.5 mt-1">{children}</h1>,
                h2:     ({ children }) => <h2 className="text-[13px] font-bold mb-1 mt-1">{children}</h2>,
                h3:     ({ children }) => <h3 className="text-[12px] font-semibold mb-0.5 mt-1">{children}</h3>,
                code:   ({ children }) => <code className="font-mono text-[11px] bg-black/10 rounded px-1">{children}</code>,
                hr:     () => <hr className="border-[var(--border-subtle)] my-1.5" />,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-[#0755E9]/40 pl-2 italic text-[var(--text-muted)] my-1">{children}</blockquote>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
        {!isUser && msg.model && (
          <p className="text-[9px] text-[var(--text-disabled)] px-1 flex items-center gap-1">
            <Sparkles className="h-2 w-2" />
            {msg.model}{msg.latencyMs ? ` · ${msg.latencyMs}ms` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#059669]/15 border border-[#059669]/30 mt-0.5">
        <Bot className="h-3 w-3 text-[#059669]" />
      </div>
      <div className="bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1">
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function FloatingAssistant() {
  const { role } = useRole();
  const [isOpen, setIsOpen]         = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [accounts, setAccounts]     = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("__portfolio__");
  const [showPicker, setShowPicker] = useState(false);
  const [unread, setUnread]         = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Load accounts
  useEffect(() => {
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setAccounts(res.data ?? []))
      .catch(() => {});
  }, [role]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Clear unread when opened
  useEffect(() => {
    if (isOpen) setUnread(0);
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;
  const prompts = selectedAccountId !== "__portfolio__"
    ? (ACCOUNT_PROMPTS[selectedAccountId] ?? ACCOUNT_PROMPTS.default)
    : PORTFOLIO_PROMPTS;

  const sendMessage = useCallback(async (content: string) => {
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

      const res = await fetch("/api/ai/assistant", {
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

      // Increment unread if panel is closed
      if (!isOpen) setUnread((n) => n + 1);
    } catch (e) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: e instanceof Error ? e.message : "Something went wrong.",
        isError: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, messages, role, selectedAccountId, isOpen]);

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

  // Panel dimensions
  const panelW = isExpanded ? "w-[520px]" : "w-[380px]";
  const panelH = isExpanded ? "h-[640px]" : "h-[500px]";

  return (
    <>
      {/* ── Floating Button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex h-14 w-14 items-center justify-center rounded-full shadow-lg",
          "transition-all duration-200 hover:scale-105 active:scale-95",
          isOpen
            ? "bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
            : "bg-[#059669] text-white shadow-[0_4px_24px_#05966944]"
        )}
        aria-label={isOpen ? "Close assistant" : "Open KAM Assistant"}
      >
        {isOpen
          ? <X className="h-5 w-5" />
          : <Bot className="h-6 w-6" />}

        {/* Unread badge */}
        {!isOpen && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50",
          "flex flex-col rounded-2xl shadow-2xl border border-[var(--glass-border)]",
          "bg-[var(--glass-elevated-bg)] [backdrop-filter:var(--glass-blur)]",
          panelW, panelH,
          "transition-all duration-200 origin-bottom-right",
          isOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        {/* Panel header */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 shrink-0 rounded-t-2xl"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#059669]/15 border border-[#059669]/30 shrink-0">
            <Bot className="h-3.5 w-3.5 text-[#059669]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-none">KAM Assistant</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">AI co-pilot · live account data</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Context selector */}
            <div className="relative">
              <button
                onClick={() => setShowPicker((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all",
                  selectedAccountId === "__portfolio__"
                    ? "bg-[#0755E9]/8 border-[#0755E9]/25 text-[#0755E9]"
                    : "bg-[var(--bg-surface-2)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                )}
              >
                {selectedAccountId === "__portfolio__" ? (
                  <><Sparkles className="h-3 w-3" /><span className="hidden sm:inline">Portfolio</span></>
                ) : (
                  <><Building2 className="h-3 w-3" />
                    <span className="max-w-[80px] truncate">{selectedAccount?.name}</span>
                    {selectedAccount && (
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: HEALTH_COLOR[selectedAccount.health] }} />
                    )}
                  </>
                )}
                <ChevronDown className={cn("h-3 w-3 transition-transform", showPicker && "rotate-180")} />
              </button>

              {showPicker && (
                <div className="absolute top-full mt-1 right-0 z-50 w-[220px] rounded-xl border border-[var(--glass-border)] bg-[var(--glass-elevated-bg)] [backdrop-filter:var(--glass-blur)] shadow-lg overflow-hidden">
                  <button
                    onClick={() => { setSelectedAccountId("__portfolio__"); setShowPicker(false); clearChat(); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2.5 text-[11px] hover:bg-[var(--bg-surface-2)] transition-colors text-left",
                      selectedAccountId === "__portfolio__" && "bg-[#0755E9]/8 text-[#0755E9]"
                    )}
                  >
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="font-medium">Portfolio context</span>
                    <span className="ml-auto text-[10px] text-[var(--text-disabled)]">All accounts</span>
                  </button>
                  <div className="h-px bg-[var(--border-subtle)]" />
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setSelectedAccountId(a.id); setShowPicker(false); clearChat(); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2.5 text-[11px] hover:bg-[var(--bg-surface-2)] transition-colors text-left",
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

            {/* Expand toggle */}
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-all"
              aria-label={isExpanded ? "Shrink" : "Expand"}
            >
              {isExpanded
                ? <Minimize2 className="h-3.5 w-3.5" />
                : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            {/* Clear */}
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)] transition-all"
                aria-label="Clear chat"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full py-4 text-center px-2">
              <div className="h-10 w-10 rounded-xl bg-[#059669]/12 border border-[#059669]/20 flex items-center justify-center mb-3">
                <Bot className="h-5 w-5 text-[#059669]" />
              </div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">How can I help?</p>
              <p className="text-[11px] text-[var(--text-muted)] mb-4 max-w-[260px] leading-relaxed">
                {selectedAccountId === "__portfolio__"
                  ? "Ask me about portfolio risks, opportunities, or action priorities."
                  : `Ask me about ${selectedAccount?.name ?? "this account"} — health, risks, or renewal strategy.`}
              </p>
              <div className="grid grid-cols-1 gap-1.5 w-full">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="text-left px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all leading-snug"
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

        {/* Quick prompts strip */}
        {!isEmpty && !loading && (
          <div className="flex gap-1.5 px-3 pb-1 overflow-x-auto shrink-0 scrollbar-none">
            {prompts.slice(0, 3).map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="shrink-0 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all whitespace-nowrap"
              >
                {p.length > 40 ? p.slice(0, 38) + "…" : p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 pt-1 shrink-0">
          <div className={cn(
            "flex items-end gap-2 rounded-xl border px-2 py-1.5 transition-all",
            "bg-[var(--bg-surface)] border-[var(--border-subtle)]",
            "focus-within:border-[#0755E9] focus-within:ring-1 focus-within:ring-[#0755E9]/20"
          )}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={loading ? "Thinking…" : "Ask anything…"}
              disabled={loading}
              rows={1}
              className={cn(
                "flex-1 resize-none bg-transparent text-[12px] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-disabled)] outline-none",
                "max-h-[80px] overflow-y-auto py-1 px-1 leading-relaxed"
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all",
                input.trim() && !loading
                  ? "bg-[#0755E9] text-white hover:bg-[#0647C7]"
                  : "bg-[var(--border-subtle)] text-[var(--text-disabled)] cursor-not-allowed"
              )}
            >
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[9px] text-[var(--text-disabled)] mt-1 px-1 text-center">
            AI responses are grounded in live account data
          </p>
        </div>
      </div>
    </>
  );
}
