"use client";

import { useState } from "react";
import { Zap, CheckCircle2, Clock, Filter, Plus, ChevronDown, X } from "lucide-react";
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
}

interface SignalsTabProps {
  signals: Signal[];
  accountId: string;
  onResolve: (signalId: string) => Promise<void>;
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
};

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "CRITICAL") return <Badge variant="critical">Critical</Badge>;
  if (severity === "HIGH")     return <Badge variant="at-risk">High</Badge>;
  return <Badge variant="neutral">Medium</Badge>;
}

function typeLabel(type: string) {
  return SIGNAL_TYPE_LABELS[type] ?? type;
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
            {SIGNAL_TYPES.map((t) => <option key={t} value={t}>{SIGNAL_TYPE_LABELS[t]}</option>)}
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
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SignalsTab({ signals, accountId, onResolve, onCreateSignal }: SignalsTabProps) {
  const { role } = useRole();
  const canResolve = role === "KAM" || role === "MANAGER";
  const canCreate  = role === "KAM" || role === "MANAGER";
  const [resolving,  setResolving]  = useState<string | null>(null);
  const [filter,     setFilter]     = useState<"ALL" | "CRITICAL" | "HIGH" | "MEDIUM">("ALL");
  const [showForm,   setShowForm]   = useState(false);

  const filtered = filter === "ALL" ? signals : signals.filter((s) => s.severity === filter);

  const handleResolve = async (id: string) => {
    setResolving(id);
    try { await onResolve(id); } finally { setResolving(null); }
  };

  const handleCreate = async (data: { type: string; severity: string; title: string; description: string | null }) => {
    await onCreateSignal(data);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter bar */}
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
          {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as const).map((f) => (
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
              {f === "ALL"      ? `All (${signals.length})` :
               f === "CRITICAL" ? `Critical (${signals.filter(s => s.severity === "CRITICAL").length})` :
               f === "HIGH"     ? `High (${signals.filter(s => s.severity === "HIGH").length})` :
                                  `Medium (${signals.filter(s => s.severity === "MEDIUM").length})`}
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
          <p className="text-[12px] text-[var(--text-muted)] mt-1">No open signals in this category</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((signal) => (
            <div
              key={signal.id}
              className={cn(
                "rounded-xl border p-4 transition-all",
                "bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)]",
                signal.severity === "CRITICAL"
                  ? "border-l-4 border-l-[#EF4444] border-[var(--glass-border)]"
                  : signal.severity === "HIGH"
                  ? "border-l-4 border-l-[#F59E0B] border-[var(--glass-border)]"
                  : "border-[var(--glass-border)]"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Zap
                    className="h-4 w-4 mt-0.5 shrink-0"
                    style={{ color: signal.severity === "CRITICAL" ? "#EF4444" : signal.severity === "HIGH" ? "#F59E0B" : "#6B7280" }}
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
                    onClick={() => handleResolve(signal.id)}
                    disabled={resolving === signal.id}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium",
                      "border border-[var(--border-subtle)] transition-all",
                      "hover:border-[#22C55E] hover:text-[#22C55E] hover:bg-[#22C55E]/5",
                      "text-[var(--text-muted)]",
                      resolving === signal.id && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {resolving === signal.id ? "Resolving…" : "Resolve"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
