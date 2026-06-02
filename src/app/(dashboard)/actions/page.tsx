"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, Clock, AlertTriangle, Filter, ChevronRight,
  Calendar, User, Building2, Plus, X,
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
  const filtered = actions.filter((a) => {
    const matchStatus =
      statusFilter === "ALL"     ? true :
      statusFilter === "OPEN"    ? a.status !== "DONE" :
      statusFilter === "OVERDUE" ? isOverdue(a.dueDate, a.status) :
      a.status === "DONE";

    const matchPriority = priorityFilter === "ALL" || a.priority === priorityFilter;
    return matchStatus && matchPriority;
  });

  // Group by status for kanban
  const grouped: Record<string, Action[]> = { OPEN: [], IN_PROGRESS: [], DISMISSED: [], DONE: [] };
  for (const a of filtered) {
    if (grouped[a.status] !== undefined) grouped[a.status].push(a);
    else grouped.OPEN.push(a);
  }

  // Stats
  const open    = actions.filter((a) => a.status !== "DONE").length;
  const overdue = actions.filter((a) => isOverdue(a.dueDate, a.status)).length;
  const done    = actions.filter((a) => a.status === "DONE").length;
  const critical = actions.filter((a) => a.priority === "CRITICAL" && a.status !== "DONE").length;

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
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">Action Board</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            All open actions and tasks across your portfolio
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-[#0755E9] rounded-xl hover:bg-[#0647C7] transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" /> New Action
          </button>
        )}
      </div>

      {showCreateModal && (
        <GlobalActionModal
          role={role}
          onSaved={reload}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-[76px]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Open",     value: open,     color: "#0755E9", icon: Clock         },
            { label: "Overdue",  value: overdue,  color: "#EF4444", icon: AlertTriangle  },
            { label: "Critical", value: critical, color: "#7C3AED", icon: AlertTriangle  },
            { label: "Completed",value: done,     color: "#22C55E", icon: CheckCircle2   },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4 flex flex-col gap-1.5">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">{label}</p>
              <div className="flex items-end justify-between">
                <p className="text-[28px] font-bold tabular-nums leading-none text-[var(--text-primary)]">{value}</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg mb-0.5" style={{ background: `${color}18` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status filter */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
          {(["ALL", "OPEN", "OVERDUE", "DONE"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                statusFilter === f
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-[var(--text-disabled)]" />
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
            {(["ALL", "CRITICAL", "HIGH", "MEDIUM"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                  priorityFilter === p
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                {p === "ALL" ? "All priorities" : PRIORITY_CONFIG[p].label}
              </button>
            ))}
          </div>
        </div>

        <span className="ml-auto text-[12px] text-[var(--text-muted)]">
          {filtered.length} action{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Kanban board */}
      {loading ? (
        <SkeletonCard className="h-[400px]" />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <CheckCircle2 className="h-12 w-12 text-[#22C55E] mb-3" />
          <p className="text-[14px] font-medium text-[var(--text-primary)]">All caught up!</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">No actions match the current filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {(["OPEN", "IN_PROGRESS", "DISMISSED", "DONE"] as const)
            .filter((s) => statusFilter === "ALL" || statusFilter === "DONE" ? true : s !== "DONE")
            .map((status) => {
              const sc = STATUS_CONFIG[status];
              const items = grouped[status] ?? [];
              return (
                <div key={status} className="space-y-2">
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-2 w-2 rounded-full" style={{ background: sc.color }} />
                    <p className="text-[12px] font-semibold text-[var(--text-primary)]">{sc.label}</p>
                    <span className="ml-auto text-[11px] text-[var(--text-muted)] tabular-nums">{items.length}</span>
                  </div>
                  {/* Cards */}
                  <div className="space-y-2">
                    {items.map((action) => (
                      <ActionCard key={action.id} action={action} onStatusChange={handleStatusChange} />
                    ))}
                    {items.length === 0 && (
                      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-8 flex items-center justify-center">
                        <p className="text-[11px] text-[var(--text-disabled)]">None</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
