"use client";

import { useState } from "react";
import {
  Plus, AlertTriangle, Wrench, DollarSign, Users, HelpCircle,
  ChevronRight, CheckCircle2, Clock, ChevronDown, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/context/RoleContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Escalation {
  id: string;
  accountId: string;
  type: string;
  severity: string;
  description: string;
  linkedProject: string | null;
  openedById: string | null;
  resolutionNotes: string | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
}

interface EscalationsTabProps {
  escalations: Escalation[];
  accountId: string;
  onCreate: (data: {
    type: string;
    severity: string;
    description: string;
    linkedProject: string | null;
  }) => Promise<void>;
  onAdvance: (id: string, newStatus: string, resolutionNotes?: string) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  DELIVERY:     { label: "Delivery",     icon: Wrench,       color: "#0755E9", bg: "rgba(7,85,233,0.09)"  },
  COMMERCIAL:   { label: "Commercial",   icon: DollarSign,   color: "#F59E0B", bg: "rgba(245,158,11,0.09)" },
  RELATIONSHIP: { label: "Relationship", icon: Users,        color: "#A855F7", bg: "rgba(168,85,247,0.09)" },
  OTHER:        { label: "Other",        icon: HelpCircle,   color: "#6B7280", bg: "rgba(107,114,128,0.09)" },
};

const SEV_META: Record<string, { label: string; color: string; bg: string }> = {
  LOW:      { label: "Low",      color: "#6B7280", bg: "rgba(107,114,128,0.10)" },
  MEDIUM:   { label: "Medium",   color: "#F59E0B", bg: "rgba(245,158,11,0.10)"  },
  HIGH:     { label: "High",     color: "#F97316", bg: "rgba(249,115,22,0.10)"  },
  CRITICAL: { label: "Critical", color: "#EF4444", bg: "rgba(239,68,68,0.10)"   },
};

const STATUS_ORDER = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
type EscStatus = typeof STATUS_ORDER[number];

const STATUS_META: Record<EscStatus, { label: string; color: string; icon: React.ElementType }> = {
  OPEN:        { label: "Open",        color: "#EF4444", icon: AlertTriangle },
  IN_PROGRESS: { label: "In Progress", color: "#F59E0B", icon: Clock         },
  RESOLVED:    { label: "Resolved",    color: "#22C55E", icon: CheckCircle2  },
};

const TYPE_KEYS   = ["DELIVERY", "COMMERCIAL", "RELATIONSHIP", "OTHER"] as const;
const SEV_KEYS    = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUS_KEYS = ["ALL", ...STATUS_ORDER] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function nextStatus(current: EscStatus): EscStatus | null {
  const i = STATUS_ORDER.indexOf(current);
  return i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

// ─── Resolve Modal ─────────────────────────────────────────────────────────────

function ResolveModal({
  onConfirm, onCancel,
}: {
  onConfirm: (notes: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [notes,   setNotes]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(notes.trim()); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface)] p-6 shadow-xl space-y-4 mx-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">Resolve Escalation</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Optionally add resolution notes before closing.</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          placeholder="What was the resolution? (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#22C55E] focus:ring-1 focus:ring-[#22C55E]/20 resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-1.5 text-[12px] font-medium text-white bg-[#22C55E] rounded-lg hover:bg-[#16A34A] disabled:opacity-50 transition-colors"
          >
            {saving ? "Resolving…" : "Mark Resolved"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateEscalationForm({
  onSave, onCancel,
}: {
  onSave: (data: { type: string; severity: string; description: string; linkedProject: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [type,          setType]          = useState("DELIVERY");
  const [severity,      setSeverity]      = useState("MEDIUM");
  const [description,   setDescription]   = useState("");
  const [linkedProject, setLinkedProject] = useState("");
  const [saving,        setSaving]        = useState(false);

  const handleSave = async () => {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await onSave({
        type,
        severity,
        description:   description.trim(),
        linkedProject: linkedProject.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const sev = SEV_META[severity];

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: `${sev.color}4D`, background: sev.bg }}
    >
      <p className="text-[12px] font-semibold text-[var(--text-primary)]">New Escalation</p>

      {/* Type + Severity row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]"
          >
            {TYPE_KEYS.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>

        <div className="relative">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] outline-none focus:border-[#0755E9]"
          >
            {SEV_KEYS.map((s) => <option key={s} value={s}>{SEV_META[s].label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
        </div>

        <input
          type="text"
          placeholder="Linked project (optional)"
          value={linkedProject}
          onChange={(e) => setLinkedProject(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9]"
        />
      </div>

      {/* Description */}
      <textarea
        autoFocus
        placeholder="Describe the escalation — what is the issue, what has been tried, what is the impact?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
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
          disabled={!description.trim() || saving}
          className="px-4 py-1.5 text-[12px] font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ background: sev.color }}
        >
          {saving ? "Saving…" : "Open Escalation"}
        </button>
      </div>
    </div>
  );
}

// ─── Escalation Card ──────────────────────────────────────────────────────────

function EscalationCard({
  esc, canEdit, onAdvance,
}: {
  esc: Escalation;
  canEdit: boolean;
  onAdvance: (id: string, newStatus: string, resolutionNotes?: string) => Promise<void>;
}) {
  const [advancing,    setAdvancing]    = useState(false);
  const [showResolve,  setShowResolve]  = useState(false);

  const typeMeta   = TYPE_META[esc.type]   ?? TYPE_META.OTHER;
  const sevMeta    = SEV_META[esc.severity] ?? SEV_META.MEDIUM;
  const statusMeta = STATUS_META[esc.status as EscStatus] ?? STATUS_META.OPEN;
  const TypeIcon   = typeMeta.icon;
  const StatusIcon = statusMeta.icon;
  const next       = nextStatus(esc.status as EscStatus);

  const handleAdvance = async () => {
    if (!next) return;
    if (next === "RESOLVED") {
      setShowResolve(true);
      return;
    }
    setAdvancing(true);
    try { await onAdvance(esc.id, next); } finally { setAdvancing(false); }
  };

  const handleResolve = async (notes: string) => {
    await onAdvance(esc.id, "RESOLVED", notes);
    setShowResolve(false);
  };

  return (
    <>
      {showResolve && (
        <ResolveModal onConfirm={handleResolve} onCancel={() => setShowResolve(false)} />
      )}

      <div className={cn(
        "rounded-xl border p-4 space-y-3 transition-all",
        esc.status === "RESOLVED"
          ? "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] opacity-70"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface-2)] hover:border-[var(--border-default)]"
      )}>
        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div
            className="shrink-0 mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: typeMeta.bg }}
          >
            <TypeIcon className="h-3.5 w-3.5" style={{ color: typeMeta.color }} />
          </div>

          <div className="min-w-0 flex-1">
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {/* Type */}
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: typeMeta.color, background: typeMeta.bg }}
              >
                {typeMeta.label}
              </span>
              {/* Severity */}
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ color: sevMeta.color, background: sevMeta.bg }}
              >
                {sevMeta.label}
              </span>
              {/* Status */}
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: statusMeta.color }}>
                <StatusIcon className="h-3 w-3" /> {statusMeta.label}
              </span>
              {/* Opened date */}
              <span className="text-[11px] text-[var(--text-disabled)] ml-auto">
                Opened {formatDate(esc.openedAt)}
              </span>
            </div>

            {/* Description */}
            <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
              {esc.description}
            </p>

            {/* Linked project */}
            {esc.linkedProject && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Project: <span className="font-medium">{esc.linkedProject}</span>
              </p>
            )}

            {/* Resolution notes */}
            {esc.resolutionNotes && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-[#22C55E]/8 border border-[#22C55E]/20">
                <p className="text-[11px] font-semibold text-[#22C55E] mb-0.5">Resolution</p>
                <p className="text-[12px] text-[var(--text-primary)]">{esc.resolutionNotes}</p>
                {esc.closedAt && (
                  <p className="text-[10px] text-[var(--text-disabled)] mt-0.5">Closed {formatDate(esc.closedAt)}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Advance button */}
        {canEdit && next && (
          <div className="flex justify-end">
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-all disabled:opacity-50",
                next === "RESOLVED"
                  ? "border-[#22C55E]/40 text-[#22C55E] hover:bg-[#22C55E]/10"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[#0755E9] hover:text-[#0755E9] hover:bg-[#0755E9]/5"
              )}
            >
              {advancing ? "…" : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  Move to {STATUS_META[next]?.label}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EscalationsTab({ escalations, accountId, onCreate, onAdvance }: EscalationsTabProps) {
  const { role }  = useRole();
  const canWrite  = role === "KAM" || role === "MANAGER";

  const [showForm,      setShowForm]      = useState(false);
  const [statusFilter,  setStatusFilter]  = useState<string>("ALL");

  const filtered = statusFilter === "ALL"
    ? escalations
    : escalations.filter((e) => e.status === statusFilter);

  const openCount = escalations.filter((e) => e.status === "OPEN").length;
  const inProgCount = escalations.filter((e) => e.status === "IN_PROGRESS").length;

  const handleCreate = async (data: Parameters<typeof onCreate>[0]) => {
    await onCreate(data);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status filter */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
          {STATUS_KEYS.map((s) => {
            const count = s === "ALL" ? escalations.length : escalations.filter((e) => e.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                  statusFilter === s
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {s === "ALL" ? "All" : STATUS_META[s as EscStatus].label}{" "}
                <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Summary chips */}
        {openCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#EF4444] bg-[#EF4444]/10 px-2.5 py-1 rounded-full">
            <AlertTriangle className="h-3 w-3" /> {openCount} open
          </span>
        )}
        {inProgCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#F59E0B] bg-[#F59E0B]/10 px-2.5 py-1 rounded-full">
            <Clock className="h-3 w-3" /> {inProgCount} in progress
          </span>
        )}

        {canWrite && (
          <button
            onClick={() => setShowForm(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#EF4444] rounded-lg hover:bg-[#DC2626] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Open Escalation
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <CreateEscalationForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <CheckCircle2 className="h-10 w-10 text-[var(--text-disabled)] mb-3" />
          <p className="text-[13px] font-medium text-[var(--text-primary)]">
            {statusFilter === "ALL" ? "No escalations on record" : `No ${STATUS_META[statusFilter as EscStatus]?.label.toLowerCase()} escalations`}
          </p>
          {canWrite && statusFilter === "ALL" && (
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              Use "Open Escalation" to flag a delivery or relationship issue
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((esc) => (
            <EscalationCard
              key={esc.id}
              esc={esc}
              canEdit={canWrite}
              onAdvance={onAdvance}
            />
          ))}
        </div>
      )}
    </div>
  );
}
