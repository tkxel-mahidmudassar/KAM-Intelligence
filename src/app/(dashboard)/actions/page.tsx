"use client";

import type { ComponentType, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, Clock, AlertTriangle, Filter, ChevronRight,
  Calendar, User, Building2, Plus, X, BookOpen, Brain,
  Flame, Search, Target, ArrowUpRight, Sparkles, ShieldAlert,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Action {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  dueDate: string | null;
  createdAt: string;
  owner: { id: string; name: string } | null;
  account: { id: string; name: string; health: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:        { label: "Open",       color: "#6B7280", bg: "#6B728010" },
  IN_PROGRESS: { label: "In Progress",color: "#0755E9", bg: "#0755E910" },
  DISMISSED:   { label: "Dismissed",  color: "#F59E0B", bg: "#F59E0B10" },
  DONE:        { label: "Done",       color: "#22C55E", bg: "#22C55E10" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:      { label: "Low",      color: "#6B7280" },
  MEDIUM:   { label: "Medium",   color: "#F59E0B" },
  HIGH:     { label: "High",     color: "#EF4444" },
  CRITICAL: { label: "Critical", color: "#7C3AED" },
};

const HEALTH_COLOR: Record<string, string> = {
  HEALTHY: "#22C55E", AT_RISK: "#F59E0B", CRITICAL: "#EF4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "DONE") return false;
  return new Date(dueDate) < new Date();
}

function dueDateLabel(dueDate: string | null): string {
  if (!dueDate) return "No due date";
  const d = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 864e5);
  if (d < 0)  return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return `Due in ${d}d`;
}

function dueDateDistance(dueDate: string | null): number {
  if (!dueDate) return 999;
  return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 864e5);
}

function priorityWeight(priority: string): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[priority] ?? 2;
}

function actionScore(action: Action): number {
  const due = dueDateDistance(action.dueDate);
  const dueWeight = due < 0 ? 5 : due === 0 ? 4 : due <= 3 ? 3 : due <= 14 ? 2 : 1;
  const statusWeight = action.status === "OPEN" ? 2 : action.status === "IN_PROGRESS" ? 1 : 0;
  return priorityWeight(action.priority) * 10 + dueWeight * 4 + statusWeight;
}

function formatStatus(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status.replaceAll("_", " ").toLowerCase();
}

function formatSource(source: string): string {
  if (source === "AI_PROPOSED") return "AI proposed";
  if (source === "PLAYBOOK") return "Playbook";
  return source.replaceAll("_", " ").toLowerCase();
}

function healthLabel(health: string | undefined): string {
  if (!health) return "Unknown";
  return health.replaceAll("_", " ").toLowerCase();
}

// ─── Action Card ──────────────────────────────────────────────────────────────

function ActionCard({ action, onStatusChange }: {
  action: Action;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  const overdue = isOverdue(action.dueDate, action.status);
  const sc = STATUS_CONFIG[action.status] ?? STATUS_CONFIG.OPEN;
  const pc = PRIORITY_CONFIG[action.priority] ?? PRIORITY_CONFIG.MEDIUM;

  const nextStatus: Record<string, string> = {
    OPEN: "IN_PROGRESS", IN_PROGRESS: "DONE",
  };
  const next = nextStatus[action.status];

  const handleAdvance = async () => {
    if (!next) return;
    setUpdating(true);
    try { await onStatusChange(action.id, next); } finally { setUpdating(false); }
  };

  return (
    <div className={cn(
      "rounded-xl border p-3.5 bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] space-y-2 transition-all",
      overdue ? "border-l-4 border-l-[#EF4444] border-[var(--glass-border)]" : "border-[var(--glass-border)]"
    )}>
      {/* Account link */}
      {action.account && (
        <Link
          href={`/accounts/${action.account.id}`}
          className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors w-fit"
        >
          <Building2 className="h-3 w-3" />
          <span className="truncate max-w-[160px]">{action.account.name}</span>
          <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: HEALTH_COLOR[action.account.health] }} />
        </Link>
      )}

      {/* Title */}
      <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
        {action.title}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status badge */}
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ color: sc.color, background: sc.bg }}
        >
          {sc.label}
        </span>
        {/* Priority */}
        <span className="text-[10px] font-medium" style={{ color: pc.color }}>
          {pc.label}
        </span>
        {/* Due date */}
        <span className={cn(
          "flex items-center gap-1 text-[10px]",
          overdue ? "text-[#EF4444] font-semibold" : "text-[var(--text-disabled)]"
        )}>
          {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
          {dueDateLabel(action.dueDate)}
        </span>
        {/* Source badge */}
        {action.source === "PLAYBOOK" && (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold border border-[#0755E9]/25 text-[#0755E9]" style={{ background: "rgba(7,85,233,0.07)" }}>
            <BookOpen className="h-2.5 w-2.5" /> Playbook
          </span>
        )}
        {action.source === "AI_PROPOSED" && (
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold border border-[#6B7280]/20 text-[var(--text-muted)]" style={{ background: "rgba(107,114,128,0.06)" }}>
            <Brain className="h-2.5 w-2.5" /> AI
          </span>
        )}
        {/* Owner */}
        {action.owner && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] ml-auto">
            <User className="h-3 w-3" /> {action.owner.name}
          </span>
        )}
      </div>

      {/* Advance button */}
      {next && (
        <button
          onClick={handleAdvance}
          disabled={updating}
          className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[#0755E9] transition-colors disabled:opacity-50"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          {updating ? "Updating…" : `Mark as ${STATUS_CONFIG[next]?.label}`}
        </button>
      )}
      {action.status === "DONE" && (
        <span className="flex items-center gap-1 text-[11px] text-[#22C55E]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Completed
        </span>
      )}
    </div>
  );
}

function MissionCard({ action, onSelect }: { action: Action; onSelect: () => void }) {
  const overdue = isOverdue(action.dueDate, action.status);
  const pc = PRIORITY_CONFIG[action.priority] ?? PRIORITY_CONFIG.MEDIUM;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group min-w-[260px] flex-1 rounded-2xl border border-white/15 bg-white/10 p-4 text-left text-white shadow-[0_18px_55px_rgba(5,12,31,0.24)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white/14"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/14 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">
          {overdue ? <ShieldAlert className="h-3 w-3 text-[#FFB4B4]" /> : <Flame className="h-3 w-3 text-[#FFD166]" />}
          {overdue ? "Overdue" : pc.label}
        </span>
        <span className="text-[10px] font-semibold text-white/60">{dueDateLabel(action.dueDate)}</span>
      </div>
      <p className="mt-3 line-clamp-2 text-[14px] font-bold leading-snug">{action.title}</p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/65">
        <Building2 className="h-3.5 w-3.5" />
        <span className="truncate">{action.account?.name ?? "Portfolio action"}</span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
}

function MetricTile({ label, value, tone, icon: Icon }: {
  label: string;
  value: number;
  tone: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
}) {
  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] [backdrop-filter:var(--glass-blur)]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `${tone}18` }}>
          <Icon className="h-4 w-4" style={{ color: tone }} />
        </span>
      </div>
      <p className="mt-3 text-[30px] font-black leading-none tracking-[-0.05em] text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ActionInboxItem({ action, selected, onSelect }: { action: Action; selected: boolean; onSelect: () => void }) {
  const overdue = isOverdue(action.dueDate, action.status);
  const pc = PRIORITY_CONFIG[action.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const sc = STATUS_CONFIG[action.status] ?? STATUS_CONFIG.OPEN;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-3 text-left transition-all",
        selected
          ? "border-[#0755E9]/55 bg-[#0755E9]/8 shadow-[0_18px_44px_rgba(7,85,233,0.16)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface-1)] hover:border-[#0755E9]/28 hover:bg-[var(--bg-surface-2)]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px_rgba(239,68,68,0.08)]" style={{ background: overdue ? "#EF4444" : pc.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-bold text-[var(--text-primary)]">{action.title}</p>
            {action.source === "AI_PROPOSED" && <Brain className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />}
            {action.source === "PLAYBOOK" && <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#0755E9]" />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-[var(--text-muted)]">
            <span className="truncate">{action.account?.name ?? "Portfolio"}</span>
            <span style={{ color: sc.color }}>{sc.label}</span>
            <span className={overdue ? "text-[#EF4444]" : ""}>{dueDateLabel(action.dueDate)}</span>
          </div>
        </div>
        <ChevronRight className={cn("mt-1 h-4 w-4 shrink-0 transition-transform", selected ? "translate-x-0.5 text-[#0755E9]" : "text-[var(--text-disabled)]")} />
      </div>
    </button>
  );
}

function ActionDetailPanel({ action, onStatusChange }: {
  action: Action | null;
  onStatusChange: (id: string, status: string) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);

  if (!action) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-8 text-center">
        <Target className="h-10 w-10 text-[var(--text-disabled)]" />
        <p className="mt-3 text-[14px] font-bold text-[var(--text-primary)]">No action selected</p>
        <p className="mt-1 max-w-sm text-[12px] text-[var(--text-muted)]">Pick an item from the inbox to inspect context, owner, due date, and next move.</p>
      </div>
    );
  }

  const sc = STATUS_CONFIG[action.status] ?? STATUS_CONFIG.OPEN;
  const pc = PRIORITY_CONFIG[action.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const nextStatus: Record<string, string> = { OPEN: "IN_PROGRESS", IN_PROGRESS: "DONE" };
  const next = nextStatus[action.status];

  const advance = async () => {
    if (!next) return;
    setUpdating(true);
    try { await onStatusChange(action.id, next); } finally { setUpdating(false); }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#0755E9]/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: sc.color, background: sc.bg }}>
            {sc.label}
          </span>
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: pc.color, background: `${pc.color}12` }}>
            {pc.label}
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", isOverdue(action.dueDate, action.status) ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[var(--bg-surface-2)] text-[var(--text-muted)]")}>
            <Calendar className="h-3 w-3" />
            {dueDateLabel(action.dueDate)}
          </span>
        </div>

        <h2 className="mt-4 text-[24px] font-black leading-tight tracking-[-0.04em] text-[var(--text-primary)]">{action.title}</h2>
        <p className="mt-3 min-h-[72px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {action.description || "No description was provided. Use the account context and due date to decide the next best move."}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Owner</p>
            <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]"><User className="h-4 w-4 text-[var(--text-muted)]" />{action.owner?.name ?? "Unassigned"}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Source</p>
            <p className="mt-2 flex items-center gap-2 text-[13px] font-semibold capitalize text-[var(--text-primary)]">
              {action.source === "AI_PROPOSED" ? <Brain className="h-4 w-4 text-[var(--text-muted)]" /> : <BookOpen className="h-4 w-4 text-[var(--text-muted)]" />}
              {formatSource(action.source)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {next && (
            <button
              type="button"
              onClick={advance}
              disabled={updating}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0755E9] px-4 py-2.5 text-[12px] font-bold text-white shadow-[0_12px_28px_rgba(7,85,233,0.28)] transition-colors hover:bg-[#0647C7] disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
              {updating ? "Updating..." : `Mark as ${STATUS_CONFIG[next]?.label}`}
            </button>
          )}
          {action.account && (
            <Link
              href={`/accounts/${action.account.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-2.5 text-[12px] font-bold text-[var(--text-primary)] transition-colors hover:border-[#0755E9]/35"
            >
              Open account <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function AccountIntelPanel({ action, actions }: { action: Action | null; actions: Action[] }) {
  const accountActions = action?.account
    ? actions.filter((a) => a.account?.id === action.account?.id)
    : [];
  const openAccountActions = accountActions.filter((a) => a.status !== "DONE");
  const overdueAccountActions = accountActions.filter((a) => isOverdue(a.dueDate, a.status));

  return (
    <aside className="space-y-3">
      <div className="rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 [backdrop-filter:var(--glass-blur)]">
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[#0755E9]" />
          Account intelligence
        </p>
        {action?.account ? (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-[13px] font-black text-white" style={{ background: HEALTH_COLOR[action.account.health] ?? "#6B7280" }}>
                {action.account.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-black text-[var(--text-primary)]">{action.account.name}</p>
                <p className="capitalize text-[11px] text-[var(--text-muted)]">{healthLabel(action.account.health)} account</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[var(--bg-surface-2)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Open</p>
                <p className="mt-1 text-[20px] font-black text-[var(--text-primary)]">{openAccountActions.length}</p>
              </div>
              <div className="rounded-2xl bg-[var(--bg-surface-2)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Overdue</p>
                <p className="mt-1 text-[20px] font-black text-[#EF4444]">{overdueAccountActions.length}</p>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-muted)]">
              Focus the next action on reducing immediate risk, then clear adjacent tasks for this same account before context-switching.
            </p>
          </>
        ) : (
          <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-muted)]">Select an action to see account-level context and workload.</p>
        )}
      </div>

      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Execution mix</p>
        <div className="mt-4 space-y-3">
          {(["CRITICAL", "HIGH", "MEDIUM"] as const).map((priority) => {
            const count = actions.filter((a) => a.priority === priority && a.status !== "DONE").length;
            const color = PRIORITY_CONFIG[priority].color;
            const pct = actions.length ? Math.min(100, (count / Math.max(1, actions.filter((a) => a.status !== "DONE").length)) * 100) : 0;
            return (
              <div key={priority}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[var(--text-secondary)]">{PRIORITY_CONFIG[priority].label}</span>
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "OPEN" | "OVERDUE" | "DONE";
type PriorityFilter = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ─── Global action create modal ───────────────────────────────────────────────

interface AccountOption { id: string; name: string; }

function GlobalActionModal({ onSaved, onClose, role }: { onSaved: () => void; onClose: () => void; role: string }) {
  const [accounts,  setAccounts]  = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [title,     setTitle]     = useState("");
  const [priority,  setPriority]  = useState("MEDIUM");
  const [dueDate,   setDueDate]   = useState("");
  const [description, setDescription] = useState("");
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    fetch("/api/accounts", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((j) => setAccounts((j.data ?? []).map((a: any) => ({ id: a.id, name: a.name }))));
  }, [role]);

  const handleSave = async () => {
    if (!title.trim() || !accountId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify({ accountId, title: title.trim(), description: description.trim() || null, priority, dueDate: dueDate || null }),
      });
      if (res.ok) { onSaved(); onClose(); }
    } finally { setSaving(false); }
  };

  const inputCls = "w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] outline-none focus:border-[#0755E9]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-surface-1)] shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold text-[var(--text-primary)]">New Action</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)]"><X className="h-4 w-4" /></button>
        </div>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Action title *" className={inputCls} />
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputCls}>
          <option value="">Select account *</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className={cn(inputCls, "resize-none")} />
        <div className="flex gap-2">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={cn(inputCls, "flex-1")}>
            {["LOW","MEDIUM","HIGH","CRITICAL"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={cn(inputCls, "flex-1")} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !accountId || saving}
            className="px-5 py-2 text-[12px] font-semibold text-white bg-[#0755E9] rounded-lg hover:bg-[#0647C7] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create Action"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActionsPage() {
  const { role } = useRole();
  const [actions, setActions]           = useState<Action[]>([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const canCreate = role === "KAM" || role === "MANAGER";

  useEffect(() => {
    setLoading(true);
    fetch("/api/actions", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setActions(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [role]);

  const handleStatusChange = async (id: string, status: string) => {
    const res  = await fetch(`/api/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.data) setActions((prev) => prev.map((a) => a.id === id ? json.data : a));
  };

  // Filter
  const filtered = useMemo(() => actions.filter((a) => {
    const matchStatus =
      statusFilter === "ALL"     ? true :
      statusFilter === "OPEN"    ? a.status !== "DONE" :
      statusFilter === "OVERDUE" ? isOverdue(a.dueDate, a.status) :
      a.status === "DONE";

    const matchPriority = priorityFilter === "ALL" || a.priority === priorityFilter;
    const q = query.trim().toLowerCase();
    const matchQuery = !q ||
      a.title.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.account?.name.toLowerCase().includes(q) ||
      a.owner?.name.toLowerCase().includes(q);
    return matchStatus && matchPriority && matchQuery;
  }).sort((a, b) => actionScore(b) - actionScore(a)), [actions, priorityFilter, query, statusFilter]);

  const selectedAction = useMemo(
    () => filtered.find((a) => a.id === selectedActionId) ?? filtered[0] ?? null,
    [filtered, selectedActionId]
  );

  const missionActions = useMemo(
    () => actions
      .filter((a) => a.status !== "DONE")
      .sort((a, b) => actionScore(b) - actionScore(a))
      .slice(0, 3),
    [actions]
  );

  // Stats
  const open    = actions.filter((a) => a.status !== "DONE").length;
  const overdue = actions.filter((a) => isOverdue(a.dueDate, a.status)).length;
  const done    = actions.filter((a) => a.status === "DONE").length;
  const critical = actions.filter((a) => a.priority === "CRITICAL" && a.status !== "DONE").length;

  useEffect(() => {
    if (!filtered.length) {
      setSelectedActionId(null);
      return;
    }
    if (!selectedActionId || !filtered.some((a) => a.id === selectedActionId)) {
      setSelectedActionId(filtered[0].id);
    }
  }, [filtered, selectedActionId]);

  const reload = () => {
    setLoading(true);
    fetch("/api/actions", { headers: { "x-role": role } })
      .then((r) => r.json())
      .then((res) => setActions(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-white/15 bg-[radial-gradient(circle_at_12%_18%,rgba(255,209,102,0.26),transparent_26%),linear-gradient(135deg,#071B3A_0%,#0755E9_48%,#0C8A7A_100%)] p-5 shadow-[0_28px_80px_rgba(7,27,58,0.28)]">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/12 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/78">
              <Target className="h-3.5 w-3.5" />
              Execution command deck
            </div>
            <h1 className="mt-4 text-[28px] font-black leading-none tracking-[-0.06em] sm:text-[38px]">Action Board</h1>
            <p className="mt-3 text-[13px] leading-relaxed text-white/72">
              A focused inbox for the work that protects renewals, clears risk, and keeps account momentum moving.
            </p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[13px] font-black text-[#071B3A] shadow-[0_14px_32px_rgba(255,255,255,0.2)] transition-all hover:-translate-y-0.5 hover:bg-[#F7FAFF]"
            >
              <Plus className="h-4 w-4" /> New Action
            </button>
          )}
        </div>

        {!loading && missionActions.length > 0 && (
          <div className="relative mt-5 flex gap-3 overflow-x-auto pb-1">
            {missionActions.map((action) => (
              <MissionCard
                key={action.id}
                action={action}
                onSelect={() => {
                  setStatusFilter("OPEN");
                  setPriorityFilter("ALL");
                  setQuery("");
                  setSelectedActionId(action.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {showCreateModal && (
        <GlobalActionModal
          role={role}
          onSaved={reload}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-[76px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricTile label="Open" value={open} tone="#0755E9" icon={Clock} />
          <MetricTile label="Overdue" value={overdue} tone="#EF4444" icon={AlertTriangle} />
          <MetricTile label="Critical" value={critical} tone="#7C3AED" icon={Flame} />
          <MetricTile label="Completed" value={done} tone="#22C55E" icon={CheckCircle2} />
        </div>
      )}

      <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-[0_18px_54px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-disabled)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actions, accounts, owners..."
              className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] py-2.5 pl-9 pr-3 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-disabled)] focus:border-[#0755E9]/45"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-1">
              {(["ALL", "OPEN", "OVERDUE", "DONE"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all",
                    statusFilter === f
                      ? "bg-[#0755E9] text-white shadow-[0_8px_18px_rgba(7,85,233,0.22)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-1">
              <Filter className="ml-1 h-3.5 w-3.5 text-[var(--text-disabled)]" />
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all",
                    priorityFilter === p
                      ? "bg-[var(--text-primary)] text-[var(--bg-surface)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {p === "ALL" ? "Priority" : PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 pt-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(360px,1.25fr)_minmax(260px,0.8fr)]">
            <SkeletonCard className="h-[520px]" />
            <SkeletonCard className="h-[520px]" />
            <SkeletonCard className="h-[520px]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <CheckCircle2 className="mb-3 h-12 w-12 text-[#22C55E]" />
            <p className="text-[14px] font-bold text-[var(--text-primary)]">All caught up</p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">No actions match the current filter.</p>
          </div>
        ) : (
          <div className="grid gap-4 pt-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(360px,1.25fr)_minmax(260px,0.8fr)]">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Priority inbox</p>
                <span className="rounded-full bg-[var(--bg-surface-2)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]">
                  {filtered.length} action{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
                {filtered.map((action) => (
                  <ActionInboxItem
                    key={action.id}
                    action={action}
                    selected={selectedAction?.id === action.id}
                    onSelect={() => setSelectedActionId(action.id)}
                  />
                ))}
              </div>
            </div>

            <ActionDetailPanel action={selectedAction} onStatusChange={handleStatusChange} />
            <AccountIntelPanel action={selectedAction} actions={actions} />
          </div>
        )}
      </section>
    </div>
  );
}
