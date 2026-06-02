"use client";

import { useState } from "react";
import { Zap, CheckCircle2, Clock, Filter, Plus, ChevronDown, X, Brain, Eye, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

interface Signal {
  id: string;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  detectedAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
  pendingReview?: boolean;
}

interface SignalsTabProps {
  signals: Signal[];
  pendingSignals?: Signal[];
  accountId: string;
  onResolve: (signalId: string) => Promise<void>;
  onAcknowledge?: (signalId: string) => Promise<void>;
  onDismiss?: (signalId: string) => Promise<void>;
  onCreateSignal: (data: { type: string; severity: string; title: string; description: string | null }) => Promise<void>;
}

const SIGNAL_TYPES = [
  "RENEWAL_RISK", "CHURN_RISK", "ESCALATION", "USAGE_DROP",
  "NPS_DECLINE", "FINANCIAL_RISK", "OPPORTUNITY", "HEALTH_ALERT", "CUSTOM",
];

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  RENEWAL_RISK: "Renewal Risk", CHURN_RISK: "Churn Risk", ESCALATION: "Escalation",
  USAGE_DROP: "Usage Drop", NPS_DECLINE: "NPS Decline", FINANCIAL_RISK: "Financial Risk",
  OPPORTUNITY: "Opportunity", HEALTH_ALERT: "Health Alert", CUSTOM: "Custom",
  REVENUE_DROP: "Revenue Drop", ENGAGEMENT_LOW: "Low Engagement", TICKET_SPIKE: "Ticket Spike",
  NPS_DECLINE_SIG: "NPS Decline", CONTRACT_EXPIRY: "Contract Expiry", CHURN_RISK_SIG: "Churn Risk",
  UPSELL_OPPORTUNITY: "Upsell Opportunity", RELATIONSHIP_CHANGE: "Relationship Change",
};

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "CRITICAL") return <Badge variant="critical">Critical</Badge>;
  if (severity === "WARNING" || severity === "HIGH") return <Badge variant="at-risk">Warning</Badge>;
  return <Badge variant="neutral">Info</Badge>;
}

function typeLabel(type: string) {
  return SIGNAL_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

// ─── Create Signal Form ───────────────────────────────────────────────────────

function CreateSignalForm({
  onSave, onCancel,
}: {
  onSave: (data: { type: string; severity: string; title: string; description: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [type,        setType]        = useState("CUSTOM");
  const [severity,    setSeverity]    = useState("WARNING");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [saving,      setSaving]      = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        type, severity, title: title.trim(),
        description: description.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[var(--text-primary)]">Log Signal</p>
        <button onClick={onCancel} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Type + Severity row */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="appearance-none pl-3 pr-7 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#EF4444]"
          >
            {SIGNAL_TYPES.map((t) => <option key={t} value={t}>{SIGNAL_TYPE_LABELS[t] ?? t}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
        </div>
        <div className="relative">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="appearance-none pl-3 pr-7 py-1.5 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#EF4444]"
          >
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-muted)]" />
        </div>
      </div>

      {/* Title */}
      <input
        autoFocus
        type="text"
        placeholder="Signal title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#EF4444]"
      />

      {/* Description */}
      <textarea
        placeholder="Additional context (optional)…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#EF4444] resize-none"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="px-4 py-1.5 text-[12px] font-medium text-white bg-[#EF4444] rounded-lg hover:bg-[#DC2626] disabled:opacity-50 transition-colors"
        >
          {saving ? "Logging…" : "Log Signal"}
        </button>
      </div>
    </div>
  );
}

// ─── Pending Review Card ──────────────────────────────────────────────────────

function PendingSignalCard({
  signal,
  onAcknowledge,
  onDismiss,
}: {
  signal: Signal;
  onAcknowledge: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const [acting, setActing] = useState<"ack" | "dismiss" | null>(null);

  const handleAck = async () => {
    setActing("ack");
    try { await onAcknowledge(); } finally { setActing(null); }
  };

  const handleDismiss = async () => {
    setActing("dismiss");
    try { await onDismiss(); } finally { setActing(null); }
  };

  return (
    <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#F59E0B]/15 mt-0.5">
            <Brain className="h-3.5 w-3.5 text-[#F59E0B]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">{signal.title}</p>
            </div>
            {signal.description && (
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{signal.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SeverityBadge severity={signal.severity} />
              <Badge variant="neutral">{typeLabel(signal.type)}</Badge>
              <span className="text-[10px] text-[#F59E0B] font-medium">AI-raised</span>
              <span className="text-[11px] text-[var(--text-disabled)] flex items-center gap-1">
                <Clock className="h-3 w-3" /> {timeAgo(signal.detectedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            disabled={acting !== null}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 transition-all disabled:opacity-50"
          >
            <XCircle className="h-3 w-3" />
            {acting === "dismiss" ? "…" : "Dismiss"}
          </button>
          <button
            onClick={handleAck}
            disabled={acting !== null}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium bg-[#22C55E] text-white hover:bg-[#16A34A] transition-all disabled:opacity-50"
          >
            <Eye className="h-3 w-3" />
            {acting === "ack" ? "…" : "Acknowledge"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({
  signal, canResolve, onResolve,
}: {
  signal: Signal;
  canResolve: boolean;
  onResolve: (id: string) => Promise<void>;
}) {
  const [resolving, setResolving] = useState(false);

  const handleResolve = async () => {
    setResolving(true);
    try { await onResolve(signal.id); } finally { setResolving(false); }
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        "bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)]",
        signal.severity === "CRITICAL"
          ? "border-l-4 border-l-[#EF4444] border-[var(--glass-border)]"
          : signal.severity === "WARNING" || signal.severity === "HIGH"
          ? "border-l-4 border-l-[#F59E0B] border-[var(--glass-border)]"
          : "border-[var(--glass-border)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Zap
            className="h-4 w-4 mt-0.5 shrink-0"
            style={{ color: signal.severity === "CRITICAL" ? "#EF4444" : signal.severity === "WARNING" || signal.severity === "HIGH" ? "#F59E0B" : "#6B7280" }}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">{signal.title}</p>
            {signal.description && (
              <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">{signal.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SeverityBadge severity={signal.severity} />
              <Badge variant="neutral">{typeLabel(signal.type)}</Badge>
              <span className="text-[11px] text-[var(--text-disabled)] flex items-center gap-1">
                <Clock className="h-3 w-3" /> {timeAgo(signal.detectedAt)}
              </span>
            </div>
          </div>
        </div>

        {canResolve && !signal.isResolved && (
          <button
            onClick={handleResolve}
            disabled={resolving}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium",
              "border border-[var(--border-subtle)] transition-all",
              "hover:border-[#22C55E] hover:text-[#22C55E] hover:bg-[#22C55E]/5",
              "text-[var(--text-muted)]",
              resolving && "opacity-50 cursor-not-allowed"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {resolving ? "Resolving…" : "Resolve"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SignalsTab({
  signals,
  pendingSignals = [],
  accountId,
  onResolve,
  onAcknowledge,
  onDismiss,
  onCreateSignal,
}: SignalsTabProps) {
  const { role } = useRole();
  const canResolve = role === "KAM" || role === "MANAGER";
  const canCreate  = role === "KAM" || role === "MANAGER";
  const [filter,   setFilter]   = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL");
  const [showForm, setShowForm] = useState(false);

  const filtered = filter === "ALL" ? signals : signals.filter((s) => s.severity === filter);

  const handleCreate = async (data: { type: string; severity: string; title: string; description: string | null }) => {
    await onCreateSignal(data);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">

      {/* ── AI-raised signals pending review ───────────────────────── */}
      {pendingSignals.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-[#F59E0B]" />
            <p className="text-[12px] font-semibold text-[#F59E0B]">
              AI-Raised — Needs Review ({pendingSignals.length})
            </p>
          </div>
          {pendingSignals.map((signal) => (
            <PendingSignalCard
              key={signal.id}
              signal={signal}
              onAcknowledge={() => onAcknowledge?.(signal.id) ?? Promise.resolve()}
              onDismiss={() => onDismiss?.(signal.id) ?? Promise.resolve()}
            />
          ))}
          <div className="border-t border-[var(--border-subtle)] pt-1" />
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
          {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 rounded-lg text-[12px] font-medium transition-all",
                filter === f
                  ? "bg-[#0755E9] text-white"
                  : "bg-[var(--bg-surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]"
              )}
            >
              {f === "ALL"      ? `Live (${signals.length})` :
               f === "CRITICAL" ? `Critical (${signals.filter(s => s.severity === "CRITICAL").length})` :
               f === "WARNING"  ? `Warning (${signals.filter(s => s.severity === "WARNING").length})` :
                                  `Info (${signals.filter(s => s.severity === "INFO").length})`}
            </button>
          ))}
        </div>

        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#EF4444] border border-[#EF4444]/40 rounded-lg hover:bg-[#EF4444]/10 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Log Signal
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <CreateSignalForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Signal list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle2 className="h-10 w-10 text-[#22C55E] mb-3" />
          <p className="text-[14px] font-medium text-[var(--text-primary)]">All clear</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">
            {pendingSignals.length > 0
              ? "No live signals — review the AI-raised signals above"
              : "No open signals in this category"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              canResolve={canResolve}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}
