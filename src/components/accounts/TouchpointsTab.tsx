"use client";

import { useState } from "react";
import {
  Plus, CalendarDays, Phone, Mail, BarChart2, Activity,
  Trash2, Users, StickyNote, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Touchpoint {
  id: string;
  accountId: string;
  type: string;
  date: string;
  notes: string | null;
  stakeholders: string | null;
  loggedBy: string | null;
  linkedDocumentId: string | null;
  createdAt: string;
}

interface TouchpointsTabProps {
  touchpoints: Touchpoint[];
  accountId: string;
  onLog: (data: {
    type: string;
    date: string;
    notes: string | null;
    stakeholders: string | null;
    loggedBy: string | null;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = {
  MEETING: { label: "Meeting",  icon: CalendarDays, color: "#0755E9", bg: "rgba(7,85,233,0.10)" },
  CALL:    { label: "Call",     icon: Phone,        color: "#22C55E", bg: "rgba(34,197,94,0.10)" },
  EMAIL:   { label: "Email",    icon: Mail,         color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  QBR:     { label: "QBR/DBR",  icon: BarChart2,    color: "#A855F7", bg: "rgba(168,85,247,0.10)" },
  OTHER:   { label: "Other",    icon: Activity,     color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
};

const TYPE_KEYS = ["MEETING", "CALL", "EMAIL", "QBR", "OTHER"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  if (days  < 30)  return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Log Activity Form ────────────────────────────────────────────────────────

function LogActivityForm({
  onSave, onCancel,
}: {
  onSave: (data: { type: string; date: string; notes: string | null; stakeholders: string | null; loggedBy: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [type,         setType]         = useState("MEETING");
  const [date,         setDate]         = useState(today);
  const [notes,        setNotes]        = useState("");
  const [stakeholders, setStakeholders] = useState("");
  const [loggedBy,     setLoggedBy]     = useState("");
  const [saving,       setSaving]       = useState(false);

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await onSave({
        type,
        date,
        notes:        notes.trim()        || null,
        stakeholders: stakeholders.trim() || null,
        loggedBy:     loggedBy.trim()     || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const meta = TYPE_META[type];

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: `${meta.color}4D`, background: meta.bg }}
    >
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">Log Activity</p>

      {/* Type + Date row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]"
          >
            {TYPE_KEYS.map((t) => (
              <option key={t} value={t}>{TYPE_META[t].label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]"
        />

        <input
          type="text"
          placeholder="Your name (optional)"
          value={loggedBy}
          onChange={(e) => setLoggedBy(e.target.value)}
          className="flex-1 min-w-[140px] px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9]"
        />
      </div>

      {/* Stakeholders */}
      <input
        type="text"
        placeholder="Stakeholders (e.g. John Smith, CTO; Jane Doe, CFO)"
        value={stakeholders}
        onChange={(e) => setStakeholders(e.target.value)}
        className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9]"
      />

      {/* Notes */}
      <textarea
        placeholder="Notes (optional) — key discussion points, outcomes, next steps…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9] resize-none"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!date || saving}
          className="px-4 py-1.5 text-[12px] font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ background: meta.color }}
        >
          {saving ? "Saving…" : "Log Activity"}
        </button>
      </div>
    </div>
  );
}

// ─── Touchpoint Row ───────────────────────────────────────────────────────────

function TouchpointRow({
  tp, canDelete, onDelete,
}: {
  tp: Touchpoint;
  canDelete: boolean;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const meta = TYPE_META[tp.type] ?? TYPE_META.OTHER;
  const Icon = meta.icon;

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(tp.id); } finally { setDeleting(false); }
  };

  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] hover:border-[var(--border-default)] transition-all group">
      {/* Type icon */}
      <div
        className="shrink-0 mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center"
        style={{ background: meta.bg }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: meta.color, background: meta.bg }}
          >
            {meta.label}
          </span>
          <span className="text-[12px] font-medium text-[var(--text-primary)]">
            {formatDate(tp.date)}
          </span>
          <span className="text-[11px] text-[var(--text-disabled)]">
            · logged {timeAgo(tp.createdAt)}
          </span>
          {tp.loggedBy && (
            <span className="text-[11px] text-[var(--text-muted)]">by {tp.loggedBy}</span>
          )}
        </div>

        {/* Stakeholders */}
        {tp.stakeholders && (
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 shrink-0 text-[var(--text-disabled)]" />
            <p className="text-[11px] text-[var(--text-muted)]">{tp.stakeholders}</p>
          </div>
        )}

        {/* Notes */}
        {tp.notes && (
          <div className="flex items-start gap-1.5">
            <StickyNote className="h-3 w-3 shrink-0 mt-0.5 text-[var(--text-disabled)]" />
            <p className="text-[12px] text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
              {tp.notes}
            </p>
          </div>
        )}
      </div>

      {/* Delete */}
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={cn(
            "shrink-0 p-1.5 rounded-lg text-[var(--text-disabled)] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all",
            "opacity-0 group-hover:opacity-100 disabled:opacity-40"
          )}
          title="Delete touchpoint"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TouchpointsTab({ touchpoints, accountId, onLog, onDelete }: TouchpointsTabProps) {
  const { role }  = useRole();
  const canWrite  = role === "KAM" || role === "MANAGER";
  const canDelete = canWrite;

  const [showForm,   setShowForm]   = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const filtered = typeFilter === "ALL"
    ? touchpoints
    : touchpoints.filter((t) => t.type === typeFilter);

  const handleLog = async (data: Parameters<typeof onLog>[0]) => {
    await onLog(data);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Type filter pills */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
          {(["ALL", ...TYPE_KEYS] as const).map((t) => {
            const count = t === "ALL" ? touchpoints.length : touchpoints.filter((tp) => tp.type === t).length;
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                  typeFilter === t
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {t === "ALL" ? "All" : TYPE_META[t].label}{" "}
                <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Log button */}
        {canWrite && (
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Log Activity
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <LogActivityForm onSave={handleLog} onCancel={() => setShowForm(false)} />
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CalendarDays className="h-10 w-10 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">
            {typeFilter === "ALL" ? "No activity logged yet" : `No ${TYPE_META[typeFilter]?.label ?? typeFilter} touchpoints`}
          </p>
          {canWrite && typeFilter === "ALL" && (
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              Click "Log Activity" to record a meeting, call, or email
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tp) => (
            <TouchpointRow
              key={tp.id}
              tp={tp}
              canDelete={canDelete}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
