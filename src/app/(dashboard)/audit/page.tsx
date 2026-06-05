"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ClipboardList, Filter, X, ChevronRight, RefreshCw } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id:        string;
  action:    string;
  entity:    string | null;
  entityId:  string | null;
  accountId: string | null;
  metadata:  Record<string, unknown> | null;
  createdAt: string;
  account:   { id: string; name: string } | null;
  user:      { id: string; name: string; role: string } | null;
}

// ─── Action display config ────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; category: string }> = {
  "score.computed":               { label: "Score Computed",          color: "#0755E9", category: "Scoring"   },
  "score_override.requested":     { label: "Override Requested",      color: "#F59E0B", category: "Override"  },
  "score_override.approved":      { label: "Override Approved",       color: "#22C55E", category: "Override"  },
  "score_override.declined":      { label: "Override Declined",       color: "#EF4444", category: "Override"  },
  "kyc.submitted":                { label: "KYC Submitted",           color: "#8B5CF6", category: "KYC"       },
  "kyc.approved":                 { label: "KYC Approved",            color: "#22C55E", category: "KYC"       },
  "kyc.rejected":                 { label: "KYC Rejected",            color: "#EF4444", category: "KYC"       },
  "kyc.updated":                  { label: "KYC Updated",             color: "#6B7280", category: "KYC"       },
  "document.signals_committed":   { label: "Signals Committed",       color: "#10B981", category: "Document"  },
  "document.signals_dismissed":   { label: "Signals Dismissed",       color: "#6B7280", category: "Document"  },
  "settings.score_weights_updated":{ label: "Weights Updated",        color: "#F97316", category: "Settings"  },
};

const CATEGORIES = ["All", "Scoring", "Override", "KYC", "Document", "Settings"];

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { label: action, color: "#6B7280", category: "Other" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Detail chip helpers ──────────────────────────────────────────────────────

function MetaChips({ action, metadata }: { action: string; metadata: Record<string, unknown> | null }) {
  if (!metadata) return null;

  const chips: { label: string; value: string; dim?: boolean }[] = [];

  if (action === "score.computed") {
    if (metadata.overall != null) chips.push({ label: "Overall", value: `${metadata.overall}/100` });
    if (metadata.health)          chips.push({ label: "Health",  value: String(metadata.health) });
  } else if (action.startsWith("score_override")) {
    if (metadata.kpiKey)          chips.push({ label: "KPI", value: String(metadata.kpiKey) });
    if (metadata.previousValue != null) chips.push({ label: "Prev",  value: String(metadata.previousValue), dim: true });
    if (metadata.requestedValue != null) chips.push({ label: "Req",  value: String(metadata.requestedValue) });
  } else if (action.startsWith("kyc")) {
    if (metadata.version)         chips.push({ label: "Version", value: `v${metadata.version}` });
    if (metadata.newStatus)       chips.push({ label: "Status",  value: String(metadata.newStatus) });
  } else if (action.startsWith("document")) {
    if (metadata.documentName)    chips.push({ label: "Doc", value: String(metadata.documentName) });
    if (metadata.committed != null) chips.push({ label: "Signals", value: String(metadata.committed) });
  } else if (action === "settings.score_weights_updated") {
    const w = metadata.weights as Record<string, number> | null;
    if (w) chips.push({ label: "CSAT", value: `${w.csat}%` }, { label: "Risk", value: `${w.risk}%` });
  }

  if (metadata.role) chips.push({ label: "By", value: String(metadata.role), dim: true });

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium",
            c.dim
              ? "bg-[var(--bg-surface-2)] text-[var(--text-disabled)]"
              : "bg-[var(--bg-surface-2)] text-[var(--text-muted)]"
          )}
        >
          <span className="text-[var(--text-disabled)]">{c.label}: </span>{c.value}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const { role } = useRole();
  const [logs,      setLogs]      = useState<AuditLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category,  setCategory]  = useState("All");
  const [search,    setSearch]    = useState("");

  const load = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res  = await fetch("/api/audit?limit=200", { headers: { "x-role": role } });
      const json = await res.json();
      if (json.data) setLogs(json.data);
    } catch { /* ignore */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [role]);

  // ── Filtering ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const meta  = getActionMeta(log.action);
      const catOk = category === "All" || meta.category === category;
      const q     = search.toLowerCase();
      const textOk = !q || (
        log.action.toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        (log.account?.name ?? "").toLowerCase().includes(q) ||
        (log.entity ?? "").toLowerCase().includes(q)
      );
      return catOk && textOk;
    });
  }, [logs, category, search]);

  // ── Category counts ───────────────────────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: logs.length };
    logs.forEach((log) => {
      const cat = getActionMeta(log.action).category;
      counts[cat] = (counts[cat] ?? 0) + 1;
    });
    return counts;
  }, [logs]);

  // ── Guard: KAM cannot access ──────────────────────────────────────────────────
  if (role === "KAM") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <ClipboardList className="h-12 w-12 text-[var(--text-disabled)]" />
        <p className="text-[14px] font-medium text-[var(--text-primary)]">Access Restricted</p>
        <p className="text-[12px] text-[var(--text-muted)]">Audit logs are visible to Managers and Executives only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">Audit Log</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {loading ? "Loading…" : `${logs.length} events recorded · score overrides, KYC approvals, document commits`}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-disabled)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, account, entity…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:outline-none focus:border-[#0755E9]/50"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-[var(--text-disabled)] hover:text-[var(--text-muted)]" />
              </button>
            )}
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border",
                  category === cat
                    ? "bg-[#0755E9] text-white border-[#0755E9]"
                    : "text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                )}
              >
                {cat}
                {categoryCounts[cat] != null && (
                  <span className={cn("ml-1.5 text-[10px] tabular-nums", category === cat ? "text-white/70" : "text-[var(--text-disabled)]")}>
                    {categoryCounts[cat]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Log table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} className="h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <ClipboardList className="h-10 w-10 text-[var(--text-disabled)]" />
          <p className="text-[13px] text-[var(--text-muted)]">
            {logs.length === 0
              ? "No audit events yet. Perform actions (score computations, KYC submissions, overrides) to generate events."
              : "No events match the current filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] divide-y divide-[var(--border-subtle)] overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[180px_1fr_160px_120px] px-5 py-2 bg-[var(--bg-surface-2)]/50">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Timestamp</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Event</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Account</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Entity</span>
          </div>

          {/* Rows */}
          {filtered.map((log) => {
            const meta = getActionMeta(log.action);
            return (
              <div
                key={log.id}
                className="grid sm:grid-cols-[180px_1fr_160px_120px] gap-y-1 sm:gap-y-0 items-start px-5 py-3.5 hover:bg-[var(--bg-surface-2)]/40 transition-colors"
              >
                {/* Timestamp */}
                <div className="flex flex-col gap-0.5 pr-3">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] tabular-nums">
                    {formatDate(log.createdAt)}
                  </span>
                  <span className="text-[10px] text-[var(--text-disabled)]">{relativeTime(log.createdAt)}</span>
                </div>

                {/* Event */}
                <div className="pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: meta.color }}
                    />
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">{meta.label}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      {meta.category}
                    </span>
                  </div>
                  <MetaChips action={log.action} metadata={log.metadata} />
                </div>

                {/* Account */}
                <div className="pr-3 pt-0.5">
                  {log.account ? (
                    <Link
                      href={`/accounts/${log.account.id}`}
                      className="flex items-center gap-1 text-[12px] text-[#0755E9] hover:underline group"
                    >
                      <span className="truncate max-w-[130px]">{log.account.name}</span>
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-[12px] text-[var(--text-disabled)] italic">Global</span>
                  )}
                </div>

                {/* Entity */}
                <div className="pt-0.5">
                  {log.entity ? (
                    <span className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface-2)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                      {log.entity}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-[11px] text-[var(--text-disabled)] text-center pb-2">
          Showing {filtered.length} of {logs.length} events
        </p>
      )}
    </div>
  );
}
